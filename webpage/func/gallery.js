// Gallery Management Functions
class GalleryManager {
    constructor(app) {
        this.app = app;
    }

    async loadPhotos() {
        try {
            // Backend expects 'page' and 'pageSize'
            const params = new URLSearchParams({
                page: this.app.galleryPage,
                pageSize: this.app.galleryPageSize
            });
            
            const response = await fetch(`/api/photos?${params}`);
            const data = await response.json();
            
            this.app.photos = data.photos || [];
            this.app.galleryTotal = data.total || 0;
            this.app.galleryPages = data.pages || 1;
            
            this.renderGallery();
            // Update header photo count and admin stats
            const countEl = document.getElementById('photo-count');
            if (countEl) countEl.textContent = this.app.galleryTotal.toString();
            if (this.app.adminManager) this.app.adminManager.renderAdminStats({
                watch_path: this.app.config?.watch_path,
                last_scan: null,
            });
            this.app.photoBoothCreator.loadAvailablePhotos(); // For creator tab
            
        } catch (error) {
            console.error('Error loading photos:', error);
            this.app.showNotification('โหลดรูปไม่สำเร็จ', 'error');
        }
    }

    renderGallery() {
        const container = document.getElementById('gallery-container');
        if (!container) return;

        if (this.app.photos.length === 0) {
            container.innerHTML = '<div class="empty-state">ไม่มีรูปในแกลเลอรี่</div>';
            return;
        }

        // Create pagination info
        const totalText = document.getElementById('gallery-total');
        if (totalText) {
            totalText.textContent = `${this.app.galleryTotal} รูป`;
        }

        // Generate pagination buttons
        const paginationContainer = document.getElementById('gallery-pagination');
        if (paginationContainer) {
            const makeBtn = (label, page, disabled=false, active=false) => 
                `<button data-page="${page}" ${disabled?'disabled':''} 
                style="padding:6px 12px;border-radius:6px;border:1px solid ${active?'#2B6CB0':'#CBD5E0'};
                background:${active?'#2B6CB0':'#FFF'};color:${active?'#FFF':'#2D3748'};
                cursor:${disabled?'not-allowed':'pointer'};font-size:0.75rem;">${label}</button>`;
            
            let pagination = '';
            pagination += makeBtn('◀', this.app.galleryPage - 1, this.app.galleryPage <= 1);
            pagination += `<span style="padding:6px 12px;font-size:0.75rem;color:#4A5568;">${this.app.galleryPage} / ${this.app.galleryPages}</span>`;
            pagination += makeBtn('▶', this.app.galleryPage + 1, this.app.galleryPage >= this.app.galleryPages);
            
            paginationContainer.innerHTML = pagination;
            
            // Bind pagination events
            paginationContainer.querySelectorAll('button[data-page]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const page = parseInt(e.target.dataset.page);
                    if (page >= 1 && page <= this.app.galleryPages) {
                        this.app.galleryPage = page;
                        this.loadPhotos();
                    }
                });
            });
        }

        // Render photo grid
    container.innerHTML = this.app.photos.map(photo => this.createPhotoCard(photo)).join('');
    }

    createPhotoCard(photo) {
        const thumbnailUrl = `/api/photos/${encodeURIComponent(photo.filename)}/thumbnail`;
        
        const sizeMB = (photo.size ? (photo.size / 1024 / 1024).toFixed(1) : null);
        const dateStr = (photo.modified ? new Date(photo.modified * 1000).toLocaleDateString('th-TH') : '');
        return `
            <div class="photo-item" data-filename="${photo.filename}">
                <div class="photo-thumbnail">
                    <img src="${thumbnailUrl}" alt="${photo.filename}" loading="lazy">
                    <div class="photo-overlay">
                        <button onclick="photoApp.photoActions.viewPhoto('${photo.filename}')">👁️</button>
                        <button onclick="photoApp.photoActions.downloadPhoto('${photo.filename}')">⬇️</button>
                        <button onclick="photoApp.photoActions.deletePhoto('${photo.filename}')" class="danger">🗑️</button>
                    </div>
                </div>
                <div class="photo-info">
                    <div class="photo-name">${photo.filename}</div>
                    <div class="photo-details">
                        ${dateStr}${sizeMB ? ` • ${sizeMB} MB` : ''}
                    </div>
                </div>
            </div>
        `;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = GalleryManager;
}
