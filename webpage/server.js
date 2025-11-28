// PhotoBooth System - Node.js (Express) - Lite Version
// Core functionality without Quick Session and Print Queue

import express from 'express';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import morgan from 'morgan';
import chokidar from 'chokidar';
import sharp from 'sharp';
import archiver from 'archiver';
import multer from 'multer';
import { fileURLToPath } from 'url';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
// Environment variables support
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths - now configurable via environment variables
const APP_ROOT = path.dirname(__dirname); // Go up one level from webpage folder
const PROCESSED_DIR = path.resolve(APP_ROOT, process.env.PROCESSED_FOLDER || 'processed_photos');
const THUMBS_DIR = path.join(PROCESSED_DIR, 'thumbnails');
const FRAMES_DIR = path.join(APP_ROOT, 'frames');
const EXPORTS_DIR = path.join(APP_ROOT, 'exports');

const app = express();
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, { cors: { origin: '*' } });
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// Helper function to parse array from env string
function parseEnvArray(envValue, defaultValue = []) {
  if (!envValue) return defaultValue;
  return envValue.split(',').map(item => item.trim());
}

// Helper function to parse number array from env string
function parseEnvNumberArray(envValue, defaultValue = []) {
  if (!envValue) return defaultValue;
  return envValue.split(',').map(item => parseInt(item.trim(), 10));
}

// Helper function to parse boolean from env string
function parseEnvBoolean(envValue, defaultValue = false) {
  if (envValue === undefined) return defaultValue;
  return envValue.toLowerCase() === 'true';
}

// Configuration from environment variables
const config = {
  watch_path: process.env.WATCH_PATH || '',
  processed_folder: process.env.PROCESSED_FOLDER || 'processed_photos',
  auto_scan: parseEnvBoolean(process.env.AUTO_SCAN, true),
  file_types: parseEnvArray(process.env.FILE_TYPES, [".jpg", ".jpeg", ".png", ".tiff", ".cr2", ".nef", ".arw"]),
  thumbnail_size: parseEnvNumberArray(process.env.THUMBNAIL_SIZE, [300, 300]),
  max_photos_display: parseInt(process.env.MAX_PHOTOS_DISPLAY || '50', 10),
  exports_ttl_hours: parseInt(process.env.EXPORTS_TTL_HOURS || '72', 10),
  enable_socket: parseEnvBoolean(process.env.ENABLE_SOCKET, true),
  port: parseInt(process.env.PORT || '5000', 10),
  host: process.env.HOST || 'localhost',
  debug: parseEnvBoolean(process.env.DEBUG, false)
};

// Log configuration for debugging
if (config.debug) {
  console.log('Configuration loaded:');
  console.log(JSON.stringify(config, null, 2));
}

// Global state
let watcher = null;
let isWatching = false;
let lastScanTime = null;
let currentTemplate = 'fourpic_blue'; // Default template

// Ensure directories exist
async function ensureDirectories() {
  try {
    await fsp.mkdir(PROCESSED_DIR, { recursive: true });
    await fsp.mkdir(THUMBS_DIR, { recursive: true });
    await fsp.mkdir(EXPORTS_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create directories:', error);
  }
}

// Initialize currentTemplate from frames/templates.json if available
async function initializeCurrentTemplate() {
  try {
    const templatesPath = path.join(FRAMES_DIR, 'templates.json');
    if (fs.existsSync(templatesPath)) {
      const data = await fsp.readFile(templatesPath, 'utf8');
      const json = JSON.parse(data);
      if (json.current_template && typeof json.current_template === 'string') {
        currentTemplate = json.current_template;
      }
    }
  } catch (err) {
    console.warn('⚠️ Could not initialize currentTemplate from templates.json:', err?.message || err);
  }
}

// Function to update .env file with new settings
async function updateEnvFile(newSettings) {
  // Write .env at project root (APP_ROOT), not inside webpage/
  const envPath = path.join(APP_ROOT, '.env');
  
  try {
    let envContent = '';
    
    // Read existing .env file
    if (fs.existsSync(envPath)) {
      envContent = await fsp.readFile(envPath, 'utf8');
    }
    
    // Parse existing environment variables
    const envVars = {};
    const lines = envContent.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const [key, ...valueParts] = trimmedLine.split('=');
        if (key && valueParts.length > 0) {
          envVars[key.trim()] = valueParts.join('=').trim();
        }
      } else {
        // Keep comments and empty lines
        envVars[`__LINE_${Object.keys(envVars).length}__`] = line;
      }
    }
    
    // Update with new settings
    const settingsToEnvMap = {
      'watch_path': 'WATCH_PATH',
      'processed_folder': 'PROCESSED_FOLDER', 
      'auto_scan': 'AUTO_SCAN',
      'file_types': 'FILE_TYPES',
      'thumbnail_size': 'THUMBNAIL_SIZE',
      'max_photos_display': 'MAX_PHOTOS_DISPLAY',
      'exports_ttl_hours': 'EXPORTS_TTL_HOURS',
      'enable_socket': 'ENABLE_SOCKET',
      'port': 'PORT',
      'host': 'HOST',
      'debug': 'DEBUG'
    };
    
    // Update settings
    for (const [settingKey, envKey] of Object.entries(settingsToEnvMap)) {
      if (newSettings[settingKey] !== undefined) {
        let value = newSettings[settingKey];
        
        // Convert arrays to comma-separated strings
        if (Array.isArray(value)) {
          value = value.join(',');
        }
        
        envVars[envKey] = value.toString();
      }
    }
    
    // Write back to .env file
    const newEnvContent = Object.entries(envVars)
      .filter(([key]) => !key.startsWith('__LINE_'))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    await fsp.writeFile(envPath, newEnvContent);
    console.log('✅ .env file updated successfully');

  } catch (error) {
    console.error(`❌ Error updating .env file:`, error);
  }
}

// --- Photo Processing and File Watching ---

// Function to process a single photo
async function processPhoto(filePath) {
  const filename = path.basename(filePath);
  const destPath = path.join(PROCESSED_DIR, filename);
  const thumbPath = path.join(THUMBS_DIR, filename);

  try {
    // 1. Copy file to processed directory
    await fsp.copyFile(filePath, destPath);

    // 2. Create thumbnail
    await sharp(destPath)
      .resize(config.thumbnail_size[0], config.thumbnail_size[1], { fit: 'inside' })
      .jpeg({ quality: 85 })
      .toFile(thumbPath);

    if (config.debug) console.log(`✅ Processed and created thumbnail for: ${filename}`);

    // 3. Notify clients via WebSocket
    if (config.enable_socket) {
      const photoData = {
        filename: filename,
        path: `/api/photos/${filename}`,
        thumbnail: `/api/photos/${filename}/thumbnail`,
        lastModified: new Date().toISOString()
      };
      io.emit('new_photo', photoData);
      if (config.debug) console.log(`📢 Emitted 'new-photo' for ${filename}`);
    }

  } catch (error) {
    console.error(`❌ Error processing photo ${filename}:`, error);
  }
}

// Function to start watching the directory
function startWatching() {
  if (!config.watch_path || !fs.existsSync(config.watch_path)) {
    console.warn(`⚠️ Watch path not set or does not exist: "${config.watch_path}". Auto-scan disabled.`);
    isWatching = false;
    return;
  }

  if (watcher) {
    console.log('Watcher already running.');
    return;
  }

  console.log(`👀 Starting to watch directory: ${config.watch_path}`);
  const watchOptions = {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true, // Don't fire 'add' events on existing files
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100
    }
  };

  watcher = chokidar.watch(config.watch_path, watchOptions);

  watcher.on('add', async (filePath) => {
    const fileExt = path.extname(filePath).toLowerCase();
    if (config.file_types.includes(fileExt)) {
      console.log(`➕ New photo detected: ${filePath}`);
      await processPhoto(filePath);
    }
  });

  watcher.on('error', error => console.error(`❌ Watcher error: ${error}`));
  isWatching = true;
  io.emit('watcher-status', { isWatching: true, path: config.watch_path });
}

// Function to stop watching
function stopWatching() {
  if (watcher) {
    watcher.close().then(() => {
      console.log('🛑 Watcher stopped.');
      watcher = null;
      isWatching = false;
      io.emit('watcher-status', { isWatching: false });
    });
  }
}

// --- API Endpoints ---

// Serve static files from the current directory (webpage)
app.use(express.static(__dirname));
// Serve processed photos and thumbnails
app.use('/api/photos', express.static(PROCESSED_DIR));
app.use('/api/photos/:filename/thumbnail', (req, res, next) => {
  req.url = `/${req.params.filename}`; // Remap to the file in the thumbnail dir
  express.static(THUMBS_DIR)(req, res, next);
});
// Serve frame images
app.use('/api/frames', express.static(FRAMES_DIR));

// --- Frames import (upload new frame image and register template) ---
const allowedFrameExts = new Set(['.jpg', '.jpeg', '.png']);
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, FRAMES_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]+/g, '_');
    let candidate = `${base}${ext}`;
    let i = 1;
    while (fs.existsSync(path.join(FRAMES_DIR, candidate))) {
      candidate = `${base}_${i}${ext}`;
      i++;
    }
    cb(null, candidate);
  },
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedFrameExts.has(ext)) return cb(new Error('Unsupported file type'));
    cb(null, true);
  },
});

app.post('/api/frames/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const background = req.file.filename;
    const displayName = (req.body.displayName || path.basename(background, path.extname(background))).toString();
    let templateKey = (req.body.templateKey || displayName)
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || path.basename(background, path.extname(background)).toLowerCase();

    const templatesPath = path.join(FRAMES_DIR, 'templates.json');
    if (!fs.existsSync(templatesPath)) {
      return res.status(404).json({ error: 'templates.json not found' });
    }
    const raw = await fsp.readFile(templatesPath, 'utf8');
    const json = JSON.parse(raw);
    if (!json.templates) json.templates = {};

    // Ensure unique key
    let key = templateKey;
    let idx = 1;
    while (json.templates[key]) {
      key = `${templateKey}_${idx++}`;
    }

    const newTemplate = {
      background,
      displayName,
      thumbnail: background,
      slots: [],
    };

    json.templates[key] = newTemplate;
    await fsp.writeFile(templatesPath, JSON.stringify(json, null, 2), 'utf8');

    res.status(201).json({ message: 'Frame imported', templateKey: key, template: newTemplate });
  } catch (err) {
    console.error('❌ Error importing frame:', err);
    res.status(500).json({ error: 'Failed to import frame' });
  }
});

// Get all photos with pagination
app.get('/api/photos', async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const pageSize = parseInt(req.query.pageSize || config.max_photos_display, 10);

    const files = await fsp.readdir(PROCESSED_DIR);
    const photoFiles = files.filter(file => config.file_types.includes(path.extname(file).toLowerCase()));

    const photoDetails = await Promise.all(
      photoFiles.map(async (file) => {
        const stats = await fsp.stat(path.join(PROCESSED_DIR, file));
        return {
          filename: file,
          path: `/api/photos/${file}`,
          thumbnail: `/api/photos/${file}/thumbnail`,
          lastModified: stats.mtime,
          // Additional fields for frontend convenience
          modified: Math.floor(stats.mtimeMs / 1000),
          size: stats.size
        };
      })
    );

    // Sort by modification time, newest first
    photoDetails.sort((a, b) => b.lastModified - a.lastModified);

    const total = photoDetails.length;
    const paginatedPhotos = photoDetails.slice((page - 1) * pageSize, page * pageSize);

    res.json({
      photos: paginatedPhotos,
      total: total,
      page: page,
      pages: Math.ceil(total / pageSize)
    });
  } catch (error) {
    console.error('❌ Error fetching photos:', error);
    res.status(500).send('Error fetching photos');
  }
});

// Delete a specific photo
app.delete('/api/photos/:filename', async (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(PROCESSED_DIR, filename);
  const thumbPath = path.join(THUMBS_DIR, filename);

  try {
    if (fs.existsSync(filePath)) await fsp.unlink(filePath);
    if (fs.existsSync(thumbPath)) await fsp.unlink(thumbPath);
  io.emit('photo_deleted', { filename });
    res.status(200).send({ message: `Deleted ${filename}` });
  } catch (error) {
    console.error(`❌ Error deleting photo ${filename}:`, error);
    res.status(500).send('Error deleting photo');
  }
});

// Clear all photos
app.delete('/api/photos', async (req, res) => {
  try {
    const files = await fsp.readdir(PROCESSED_DIR);
    for (const file of files) {
      if (file !== 'thumbnails') {
        await fsp.unlink(path.join(PROCESSED_DIR, file));
      }
    }
    const thumbFiles = await fsp.readdir(THUMBS_DIR);
    for (const file of thumbFiles) {
      await fsp.unlink(path.join(THUMBS_DIR, file));
    }
  io.emit('photos_cleared');
    res.status(200).send({ message: 'All photos cleared' });
  } catch (error) {
    console.error('❌ Error clearing photos:', error);
    res.status(500).send('Error clearing photos');
  }
});

// Get system status
app.get('/api/status', (req, res) => {
  res.json({
    isWatching: isWatching,
    watchPath: config.watch_path,
    lastScanTime: lastScanTime,
    processed_dir: PROCESSED_DIR,
    socket_enabled: config.enable_socket
  });
});

app.get('/api/settings', (req, res) => {
  res.json(config);
});

app.post('/api/settings', async (req, res) => {
  const newSettings = req.body;
  Object.assign(config, newSettings);
  await updateEnvFile(newSettings);

  // Restart watcher if path changed
  if (newSettings.watch_path !== undefined) {
    stopWatching();
    startWatching();
  }

  res.status(200).send({ message: 'Settings updated' });
});

// Manual scan
app.post('/api/scan', async (req, res) => {
  if (!config.watch_path || !fs.existsSync(config.watch_path)) {
    return res.status(400).send('Watch path not configured or does not exist.');
  }

  try {
    console.log('🚀 Starting manual scan...');
    const files = await fsp.readdir(config.watch_path);
    const existingPhotos = await fsp.readdir(PROCESSED_DIR);
    let newPhotosCount = 0;

    for (const file of files) {
      if (config.file_types.includes(path.extname(file).toLowerCase()) && !existingPhotos.includes(file)) {
        await processPhoto(path.join(config.watch_path, file));
        newPhotosCount++;
      }
    }
    lastScanTime = new Date().toISOString();
    res.status(200).send({ 
      message: `Manual scan complete. Found ${newPhotosCount} new photos.`,
      newPhotosCount
    });
  } catch (error) {
    console.error('❌ Error during manual scan:', error);
    res.status(500).send('Error during manual scan');
  }
});

// Toggle watching
app.post('/api/toggle-watch', (req, res) => {
  const { enable } = req.body;
  if (enable) {
    startWatching();
  } else {
    stopWatching();
  }
  res.status(200).send({ message: `Watching ${enable ? 'started' : 'stopped'}.` });
});

// Get templates
app.get('/api/templates', async (req, res) => {
  try {
    const templatesPath = path.join(FRAMES_DIR, 'templates.json');
    const data = await fsp.readFile(templatesPath, 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    console.error('❌ Error reading templates:', error);
    res.status(500).send('Error reading templates');
  }
});

// Save frame mapping (update slots for a given frame key)
app.post('/api/save-frame-mapping', async (req, res) => {
  try {
    const { frameKey, slots } = req.body || {};
    if (!frameKey || !Array.isArray(slots)) {
      return res.status(400).json({ error: 'frameKey and slots are required' });
    }

    const templatesPath = path.join(FRAMES_DIR, 'templates.json');
    if (!fs.existsSync(templatesPath)) {
      return res.status(404).json({ error: 'templates.json not found' });
    }

    const data = await fsp.readFile(templatesPath, 'utf8');
    const json = JSON.parse(data);
    if (!json.templates || !json.templates[frameKey]) {
      return res.status(404).json({ error: `Frame template not found: ${frameKey}` });
    }

    // Basic validation/normalization of slots
    const normalized = slots.map(s => ({
      x: Number(s.x) || 0,
      y: Number(s.y) || 0,
      width: Number(s.width) || 0,
      height: Number(s.height) || 0
    }));

    json.templates[frameKey].slots = normalized;
    await fsp.writeFile(templatesPath, JSON.stringify(json, null, 2), 'utf8');

    res.status(200).json({ message: 'Frame mapping saved', frameKey, slots: normalized });
  } catch (error) {
    console.error('❌ Error saving frame mapping:', error);
    res.status(500).json({ error: 'Failed to save frame mapping' });
  }
});

// Delete a template by key
app.delete('/api/templates/:key', async (req, res) => {
  try {
    const key = req.params.key;
    const templatesPath = path.join(FRAMES_DIR, 'templates.json');
    if (!fs.existsSync(templatesPath)) {
      return res.status(404).json({ error: 'templates.json not found' });
    }

    const raw = await fsp.readFile(templatesPath, 'utf8');
    const json = JSON.parse(raw);
    if (!json.templates || !json.templates[key]) {
      return res.status(404).json({ error: `Template not found: ${key}` });
    }

    const removed = json.templates[key];
    delete json.templates[key];

    // If current_template is the one removed, pick a fallback
    if (json.current_template === key) {
      const remainingKeys = Object.keys(json.templates);
      json.current_template = remainingKeys[0] || null;
      currentTemplate = json.current_template || null;
    }

    // Optionally cleanup files if not referenced by any other template
    const referencedFiles = new Set();
    for (const t of Object.values(json.templates)) {
      if (t.background) referencedFiles.add(t.background);
      if (t.thumbnail) referencedFiles.add(t.thumbnail);
    }
    const candidates = [removed.background, removed.thumbnail].filter(Boolean);
    for (const file of candidates) {
      if (!referencedFiles.has(file)) {
        const full = path.join(FRAMES_DIR, file);
        if (fs.existsSync(full)) {
          try { await fsp.unlink(full); } catch (e) { /* ignore */ }
        }
      }
    }

    await fsp.writeFile(templatesPath, JSON.stringify(json, null, 2), 'utf8');
    res.status(200).json({ message: 'Template deleted', key, current_template: json.current_template });
  } catch (err) {
    console.error('❌ Error deleting template:', err);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// Get current template
app.get('/api/current-template', (req, res) => {
  res.json({ currentTemplate });
});

// Set current template
app.post('/api/current-template', (req, res) => {
  const { template } = req.body;
  if (template) {
    currentTemplate = template;
    // Persist to templates.json
    (async () => {
      try {
        const templatesPath = path.join(FRAMES_DIR, 'templates.json');
        if (fs.existsSync(templatesPath)) {
          const data = await fsp.readFile(templatesPath, 'utf8');
          const json = JSON.parse(data);
          json.current_template = template;
          // Remove legacy field if exists
          if (Object.prototype.hasOwnProperty.call(json, 'current')) delete json.current;
          await fsp.writeFile(templatesPath, JSON.stringify(json, null, 2), 'utf8');
        }
      } catch (e) {
        console.warn('⚠️ Failed to persist current_template:', e?.message || e);
      }
    })();
    res.status(200).send({ message: `Template set to ${template}` });
  } else {
    res.status(400).send('Template name required');
  }
});

// Create photobooth image
app.post('/api/create-photobooth', async (req, res) => {
  const { template, slots, comment } = req.body;
  if (!template || !template.background || !slots) {
    return res.status(400).send('Invalid template or slot data');
  }

  const framePath = path.join(FRAMES_DIR, template.background);
  if (!fs.existsSync(framePath)) {
    return res.status(404).send(`Frame not found: ${template.background}`);
  }

  try {
    const frame = sharp(framePath);
    const frameMetadata = await frame.metadata();
    const frameWidth = frameMetadata.width;
    const frameHeight = frameMetadata.height;

    const composites = [];
    for (const slot of slots) {
      if (slot.photo) {
        const photoPath = path.join(PROCESSED_DIR, slot.photo);
        if (fs.existsSync(photoPath)) {
          const photoBuffer = await sharp(photoPath)
            .resize(
              Math.round(frameWidth * slot.width),
              Math.round(frameHeight * slot.height),
              { fit: 'cover', position: 'center' }
            )
            .toBuffer();

          composites.push({
            input: photoBuffer,
            left: Math.round(frameWidth * slot.x),
            top: Math.round(frameHeight * slot.y)
          });
        }
      }
    }

    // Add comment if provided
    if (comment && template.commentBox) {
      const { font, ...box } = template.commentBox;
      const textSvg = `
        <svg width="${Math.round(frameWidth * box.width)}" height="${Math.round(frameHeight * box.height)}">
          <style>
            .title { 
              fill: ${font.color || '#000'}; 
              font-size: ${Math.round(frameHeight * font.sizeRel)}px; 
              font-family: ${font.family || 'Arial'};
              text-anchor: ${font.align === 'center' ? 'middle' : (font.align === 'right' ? 'end' : 'start')};
            }
          </style>
          <text x="50%" y="50%" dy=".3em" class="title">${comment}</text>
        </svg>`;
      
      composites.push({
        input: Buffer.from(textSvg),
        left: Math.round(frameWidth * box.x),
        top: Math.round(frameHeight * box.y)
      });
    }

    const finalImage = await frame.composite(composites).jpeg({ quality: 95 }).toBuffer();
    res.set('Content-Type', 'image/jpeg');
    res.send(finalImage);

  } catch (error) {
    console.error('❌ Error creating photobooth image:', error);
    res.status(500).send('Error creating image');
  }
});

// Export all photos as a ZIP
app.post('/api/export', (req, res) => {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const zipFileName = `photos_export_${timestamp}.zip`;
  const zipFilePath = path.join(EXPORTS_DIR, zipFileName);
  const output = fs.createWriteStream(zipFilePath);

  output.on('close', () => {
    console.log(`📦 Export created: ${zipFileName} (${archive.pointer()} total bytes)`);
    res.status(201).send({
      message: 'Export successful',
      url: `/api/exports/${zipFileName}`
    });
  });

  archive.on('error', err => {
    console.error('❌ Error creating export:', err);
    res.status(500).send('Error creating export');
  });

  archive.pipe(output);
  archive.directory(PROCESSED_DIR, 'Pics');
  archive.directory(FRAMES_DIR, 'FramesWithPics'); // Example, adjust as needed
  archive.finalize();
});

// Serve exported files
app.use('/api/exports', express.static(EXPORTS_DIR));

// --- Socket.IO Listeners ---
io.on('connection', (socket) => {
  if (config.debug) console.log(`🔌 New client connected: ${socket.id}`);
  socket.emit('welcome', { message: 'Connected to PhotoBooth server' });
  socket.on('disconnect', () => {
    if (config.debug) console.log(`👋 Client disconnected: ${socket.id}`);
  });
});

// --- Server Initialization ---
async function startServer() {
  await ensureDirectories();
  await initializeCurrentTemplate();

  // Start watching if auto-scan is enabled
  if (config.auto_scan) {
    startWatching();
  }

  httpServer.listen(config.port, config.host, () => {
    console.log(`\n--- PhotoBooth Lite Server ---`);
    console.log(`🚀 Server running at http://${config.host}:${config.port}`);
    console.log(`🖼️  Processing photos in: ${PROCESSED_DIR}`);
    console.log(`👀 Watching: ${config.watch_path || 'Not set'}`);
    console.log(`🔌 WebSocket: ${config.enable_socket ? 'Enabled' : 'Disabled'}`);
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nGracefully shutting down...');
  stopWatching();
  httpServer.close(() => {
    console.log('✅ Server stopped.');
    process.exit(0);
  });
});

// Start the server
startServer().catch(error => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
