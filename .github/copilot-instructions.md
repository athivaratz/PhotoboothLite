# PTB-Lite Copilot Instructions

## Project Overview
PhotoBooth system (lite version) - A Node.js/Express web app for managing photos, creating photo compositions with templates, and real-time photo detection via WebSocket.

## Architecture

### Backend (`webpage/server.js`)
- **Express 5** server with ES modules (`"type": "module"`)
- **Socket.IO** for real-time photo detection events (`new_photo`, `photo_deleted`, `photos_cleared`)
- **Sharp** for image processing (thumbnails, photo composition)
- **Chokidar** for file system watching
- Configuration via `.env` file at project root (not in `webpage/`)

### Frontend (`webpage/`)
- Single-page app with tab-based UI (Gallery, Creator, Frames, Admin)
- Manager class pattern - each `func/*.js` file exports a class instantiated by `app.js`
- Classes receive `app` instance for cross-manager communication
- Socket.IO client connects automatically on page load

### Key Data Flows
```
Watch folder → Chokidar → processPhoto() → Sharp thumbnail → Socket.IO emit → Frontend refresh
Template slots → POST /api/create-photobooth → Sharp composite → JPEG response
```

## Project Structure Conventions

### Frontend Managers (`webpage/func/`)
Each manager class follows this pattern:
```javascript
class ManagerName {
    constructor(app) {
        this.app = app;
        setTimeout(() => this.bindEvents(), 100); // DOM ready
    }
    // Export for browser
}
window.ManagerName = ManagerName;
```

Access other managers via `this.app.galleryManager`, `this.app.photoBoothCreator`, etc.

### Template Configuration (`frames/templates.json`)
```json
{
  "templates": {
    "template_key": {
      "background": "image.jpg",
      "displayName": "Display Name",
      "slots": [{ "x": 0.1, "y": 0.1, "width": 0.8, "height": 0.3 }]
    }
  },
  "current_template": "template_key"
}
```
Slot coordinates are **relative (0-1 range)** not pixels.

## Commands

```bash
npm start          # Production server (port 5000)
npm run dev        # Development server
npm run doctor     # Check Node version
```

## API Patterns

### Photo endpoints
- `GET /api/photos?page=1&pageSize=50` - Paginated list
- `GET /api/photos/:filename/thumbnail` - Thumbnail (Sharp-generated)
- `DELETE /api/photos/:filename` - Delete single + emit socket event

### Template endpoints
- `POST /api/save-frame-mapping` - Save slot positions `{ frameKey, slots }`
- `POST /api/create-photobooth` - Generate composite `{ template, slots, comment }`

### Settings persistence
Settings are written to `.env` at **project root** via `updateEnvFile()`.

## Code Patterns

### Notifications (Thai UI)
```javascript
this.app.uiUtils?.showNotification('ข้อความ', 'success|error|warning|info');
```

### Socket Events
```javascript
io.emit('new_photo', { filename, path, thumbnail, lastModified });
io.emit('photo_deleted', { filename });
io.emit('photos_cleared');
```

### Image Processing
All photo processing uses Sharp with cover fit:
```javascript
await sharp(photoPath)
  .resize(width, height, { fit: 'cover', position: 'center' })
  .toBuffer();
```

## Important Considerations

1. **Thai language** - All UI text is in Thai. Maintain consistency.
2. **Relative slot coordinates** - Always use 0-1 range, multiply by image dimensions at render time
3. **Module loading order** - `func/*.js` must load before `app.js` (see index.html)
4. **No test framework** - Manual testing only
5. **Environment reload** - Server restart required after `.env` changes (watcher auto-restarts)
