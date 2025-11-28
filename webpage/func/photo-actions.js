// Photo Actions Functions
class PhotoActions {
    constructor(app) {
        this.app = app;
    }

    viewPhoto(filename) {
        window.open(`/api/photos/${encodeURIComponent(filename)}`, '_blank');
    }

    downloadPhoto(filename) {
        const link = document.createElement('a');
        link.href = `/api/photos/${encodeURIComponent(filename)}`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    async deletePhoto(filename) {
        if (!confirm(`ต้องการลบ "${filename}" หรือไม่?`)) return;

        try {
            const response = await fetch(`/api/photos/${encodeURIComponent(filename)}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.app.showNotification(`ลบ "${filename}" แล้ว`, 'success');
                this.app.galleryManager.loadPhotos();
            } else {
                this.app.showNotification('การลบล้มเหลว', 'error');
            }
        } catch (error) {
            console.error('Error deleting photo:', error);
            this.app.showNotification('การลบล้มเหลว', 'error');
        }
    }

    async exportPhotos() {
        try {
            const response = await fetch('/api/export', { method: 'POST' });
            const result = await response.json();
            
            if (response.ok) {
                // Download the zip file (prefer server-provided URL)
                const link = document.createElement('a');
                const href = result.url || `/api/exports/${result.filename}`;
                const name = result.filename || 'photos_export.zip';
                link.href = href;
                link.download = name;
                document.body.appendChild(link);
                link.click();
                link.remove();
                this.app.showNotification('เริ่มดาวน์โหลดไฟล์ส่งออก', 'success');
            } else {
                this.app.showNotification(result.error || 'การส่งออกล้มเหลว', 'error');
            }
        } catch (error) {
            console.error('Error exporting:', error);
            this.app.showNotification('การส่งออกล้มเหลว', 'error');
        }
    }

    async clearAllPhotos() {
        if (!confirm('ต้องการลบรูปทั้งหมดหรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้!')) return;

        try {
            const response = await fetch('/api/photos', { method: 'DELETE' });
            if (response.ok) {
                this.app.showNotification('ลบรูปทั้งหมดแล้ว', 'success');
                this.app.galleryManager.loadPhotos();
            } else {
                this.app.showNotification('การลบล้มเหลว', 'error');
            }
        } catch (error) {
            console.error('Error clearing photos:', error);
            this.app.showNotification('การลบล้มเหลว', 'error');
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PhotoActions;
}
