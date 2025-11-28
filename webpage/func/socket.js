// Socket.IO Manager
class SocketManager {
    constructor(app) {
        this.app = app;
        this.socket = null;
    }

    initSocketIO() {
        try {
            console.log('Initializing SocketIO...');
            
            // Check if io is available with retry logic
            if (typeof io === 'undefined') {
                console.error('Socket.IO library not loaded, retrying in 2 seconds...');
                setTimeout(() => this.initSocketIO(), 2000);
                return;
            }
            
            // If socket already exists, disconnect first
            if (this.socket) {
                this.socket.disconnect();
                this.socket = null;
            }
            
            this.socket = io({
                transports: ['websocket', 'polling'],
                upgrade: true,
                rememberUpgrade: true,
                timeout: 20000,
                forceNew: true
            });
            
            this.socket.on('connect', () => {
                console.log('Connected to server via WebSocket, ID:', this.socket.id);
                this.app.showNotification('✅ WebSocket เชื่อมต่อสำเร็จ', 'success');
                this.updateConnectionStatus('connected');
            });

            this.socket.on('disconnect', (reason) => {
                console.log('Disconnected from server, reason:', reason);
                this.app.showNotification('⚠️ WebSocket ขาดการเชื่อมต่อ', 'warning');
                this.updateConnectionStatus('disconnected');
            });

            this.socket.on('connect_error', (error) => {
                console.error('Socket.IO connection error:', error);
                this.app.showNotification('❌ ไม่สามารถเชื่อมต่อ WebSocket ได้', 'error');
                this.updateConnectionStatus('error');
            });

            this.socket.on('new_photo', (data) => {
                console.log('New photo received via WebSocket:', data);
                
                // Update detection tracking
                this.app.lastDetectedPhoto = data.filename;
                this.app.lastDetectedTime = Date.now();
                
                // Show notification
                this.app.showNotification(`รูปใหม่: ${data.filename}`, 'success');
                
                // Debounced gallery refresh
                if (this.app._photosReloadTimer) clearTimeout(this.app._photosReloadTimer);
                this.app._photosReloadTimer = setTimeout(()=> this.app.galleryManager.loadPhotos(), 250);
            });

            this.socket.on('photo_deleted', (data) => {
                console.log('Photo deleted via WebSocket:', data);
                this.app.showNotification(`ลบรูปแล้ว: ${data.filename}`, 'warning');
                this.app.galleryManager.loadPhotos(); // Reload gallery immediately
            });

            this.socket.on('photos_cleared', () => {
                console.log('All photos cleared via WebSocket');
                this.app.showNotification('ลบรูปทั้งหมดแล้ว', 'info');
                this.app.galleryManager.loadPhotos(); // Reload gallery immediately
            });

            this.socket.on('reconnect', (attemptNumber) => {
                console.log('Reconnected after', attemptNumber, 'attempts');
                this.app.showNotification('เชื่อมต่อ WebSocket สำเร็จ (รี-คอนเนค)', 'success');
            });

            this.socket.on('reconnect_error', (error) => {
                console.error('Reconnect error:', error);
            });
            
        } catch (error) {
            console.error('Failed to initialize SocketIO:', error);
            this.app.showNotification('เริ่มต้น Socket.IO ไม่สำเร็จ: ' + error.message, 'error');
        }
    }

    updateConnectionStatus(status) {
        const statusDot = document.getElementById('status-dot');
        const statusText = document.getElementById('status-text');
        
        if (statusDot && statusText) {
            statusDot.className = 'status-dot';
            switch (status) {
                case 'connected':
                    statusDot.classList.add('connected');
                    statusText.textContent = 'เชื่อมต่อแล้ว';
                    break;
                case 'disconnected':
                    statusDot.classList.add('warning');
                    statusText.textContent = 'ขาดการเชื่อมต่อ';
                    break;
                case 'error':
                    statusText.textContent = 'ผิดพลาดในการเชื่อมต่อ';
                    break;
                default:
                    statusText.textContent = 'กำลังตรวจสอบ...';
            }
        }
    }

    isConnected() {
        return this.socket && this.socket.connected;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SocketManager;
}
