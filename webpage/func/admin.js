// Admin Functions
class AdminManager {
    constructor(app) {
        this.app = app;
        // Bind after DOM ready
        setTimeout(() => this.bindEvents(), 100);
    }

    async loadStatus() {
        try {
            const response = await fetch('/api/status');
            const status = await response.json();
            
            // Reflect to header status bar (IDs actually present in index.html)
            this.renderStatusBar(status);

            // Render basic admin stats section if present
            this.renderAdminStats(status);

        } catch (error) {
            console.error('Error loading status:', error);
        }
    }

    async loadConfig() {
        try {
            const response = await fetch('/api/settings');
            const data = await response.json();
            this.app.config = data;

            // Update path input
            const pathInput = document.getElementById('watch-path-input');
            if (pathInput) {
                pathInput.value = data.watch_path || '';
            }

            // Update header current path
            const currentPath = document.getElementById('current-path');
            if (currentPath) currentPath.textContent = data.watch_path || '-';

        } catch (error) {
            console.error('Error loading config:', error);
        }
    }

    async manualScan() {
        try {
            const response = await fetch('/api/scan', { method: 'POST' });
            const result = await response.json();
            const found = result.newPhotosCount ?? result.new_photos ?? result.found ?? '0';
            this.app.showNotification(`สแกนเสร็จ: พบ ${found} รูปใหม่`, 'success');
            this.app.galleryManager.loadPhotos();
            this.loadStatus();
        } catch (error) {
            console.error('Error scanning:', error);
            this.app.showNotification('การสแกนล้มเหลว', 'error');
        }
    }

    async toggleWatch() {
        try {
            const enable = !this.app?.lastToggleEnable;
            this.app.lastToggleEnable = enable;
            const response = await fetch('/api/toggle-watch', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enable })
            });
            const result = await response.json();
            this.app.showNotification(result.message || (enable ? 'เริ่มเฝ้าดูแล้ว' : 'หยุดเฝ้าดูแล้ว'), 'info');
            this.loadStatus();
        } catch (error) {
            console.error('Error toggling watch:', error);
            this.app.showNotification('การเปลี่ยนสถานะล้มเหลว', 'error');
        }
    }

    async savePath() {
        const pathInput = document.getElementById('watch-path-input');
        if (!pathInput) return;

        try {
            const response = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ watch_path: pathInput.value })
            });

            if (response.ok) {
                this.app.showNotification('บันทึกเส้นทางแล้ว', 'success');
                this.loadStatus();
            } else {
                this.app.showNotification('การบันทึกล้มเหลว', 'error');
            }
        } catch (error) {
            console.error('Error saving path:', error);
            this.app.showNotification('การบันทึกล้มเหลว', 'error');
        }
    }

    setTodayFolder() {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const pathInput = document.getElementById('watch-path-input');
        if (pathInput) {
            pathInput.value = `C:\\Photos\\${today}`;
        }
    }

    async browseFolder() {
        // This would open a folder browser - implementation depends on backend
        this.app.showNotification('ฟังก์ชันนี้ต้องการการปรับปรุง', 'info');
    }

    async loadAdminData() {
        // This would load admin-specific data
        // Implementation depends on requirements
    }

    // --- UI Wiring & Render helpers ---
    bindEvents() {
        const bind = (id, handler) => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('click', (e) => {
                    e.preventDefault();
                    handler.call(this);
                });
                console.log(`Bound admin button: #${id}`);
            }
        };

        // Header controls
        bind('btn-scan', this.manualScan);
        bind('btn-toggle-watch', this.toggleWatch);
        const exportBtn = document.getElementById('btn-export');
        if (exportBtn) {
            exportBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.app.photoActions.exportPhotos();
            });
            console.log('Bound admin button: #btn-export');
        }

        // Admin panel controls
        bind('btn-save-path', this.savePath);
        bind('btn-browse-folder', this.browseFolder);
        bind('btn-today-folder', this.setTodayFolder);
        const clearAll = document.getElementById('btn-clear-all');
        if (clearAll) {
            clearAll.addEventListener('click', (e) => {
                e.preventDefault();
                this.app.photoActions.clearAllPhotos();
            });
            console.log('Bound admin button: #btn-clear-all');
        }
        const refreshGal = document.getElementById('btn-refresh-gallery');
        if (refreshGal) {
            refreshGal.addEventListener('click', (e) => {
                e.preventDefault();
                this.app.galleryManager.loadPhotos();
            });
            console.log('Bound admin button: #btn-refresh-gallery');
        }
    }

    renderStatusBar(status) {
        const dot = document.getElementById('status-dot');
        const text = document.getElementById('status-text');
        const pathEl = document.getElementById('current-path');

        if (dot) {
            dot.classList.toggle('connected', !!status.isWatching);
            dot.classList.toggle('warning', !status.watchPath);
        }
        if (text) {
            const last = status.lastScanTime ? new Date(status.lastScanTime).toLocaleString('th-TH') : '—';
            text.textContent = `${status.isWatching ? 'กำลังเฝ้าดู' : 'หยุดเฝ้าดู'} • สแกนล่าสุด: ${last}`;
        }
        if (pathEl) pathEl.textContent = status.watchPath || '-';
    }

    renderAdminStats(status) {
        const stats = document.getElementById('admin-stats');
        if (!stats) return;
    const last = status.lastScanTime ? new Date(status.lastScanTime).toLocaleString('th-TH') : '—';
        const count = this.app.galleryTotal || 0;
        stats.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">
                <div class="status-item">📁 โฟลเดอร์: <span style="margin-left:6px;">${status.watch_path || '-'}</span></div>
                <div class="status-item">🕒 สแกนล่าสุด: <span style="margin-left:6px;">${last}</span></div>
                <div class="status-item">🖼️ จำนวนรูป: <span style="margin-left:6px;">${count}</span></div>
            </div>
        `;
        const history = document.getElementById('path-history');
        if (history && !history.dataset.filled) {
            history.innerHTML = '<div style="color:#6B7280;">ยังไม่มีประวัติโฟลเดอร์</div>';
            history.dataset.filled = '1';
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AdminManager;
}
