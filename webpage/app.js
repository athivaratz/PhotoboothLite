// PhotoBooth Gallery App - Frontend JavaScript (Lite Version)
(function() {
    'use strict';

    class PhotoBoothApp {
        constructor() {
            // Core properties
            this.photos = [];
            this.galleryPage = 1;
            this.galleryPageSize = 60;
            this.galleryTotal = 0;
            this.galleryPages = 1;
            this.showPhotobooth = true;
            this.config = {};
            this.currentTab = 'gallery';
            this.templates = {};
            this.currentTemplate = null;
            this.selectedSlot = null;
            this.slotAssignments = {};
            this.availablePhotos = [];
            this.lastDetectedPhoto = null;
            this.lastDetectedTime = 0;
            this.lastCreatedPhoto = null;
            
            // Initialize managers
            this.socketManager = new SocketManager(this);
            this.galleryManager = new GalleryManager(this);
            this.photoBoothCreator = new PhotoBoothCreator(this);
            this.photoActions = new PhotoActions(this);
            this.adminManager = new AdminManager(this);
            this.frameManager = new FrameManager(this);
            
            this.init();
        }

        async init() {
            // Initialize UIUtils first after DOM is ready
            this.uiUtils = new UIUtils(this);
            
            this.socketManager.initSocketIO();
            this.uiUtils.bindEvents();
            this.adminManager.loadStatus();
            this.galleryManager.loadPhotos();
            this.adminManager.loadConfig();
            
            // Load templates first, then current template
            await this.photoBoothCreator.loadTemplates();
            this.photoBoothCreator.loadCurrentTemplate();
            this.frameManager.loadFrames();
            
            // Auto refresh every 30 seconds as backup
            setInterval(() => {
                this.adminManager.loadStatus();
                if (!this.socketManager.isConnected()) {
                    this.galleryManager.loadPhotos();
                }
            }, 30000);
        }

        // Utility methods that need to be accessible globally
        showNotification(message, type = 'info') {
            this.uiUtils.showNotification(message, type);
        }

        switchTab(tabName) {
            this.uiUtils.switchTab(tabName);
        }
    }

    // Initialize the app when DOM is loaded
    document.addEventListener('DOMContentLoaded', () => {
        window.photoApp = new PhotoBoothApp();
    });

})();
// PhotoBooth Gallery App - Frontend JavaScript (Lite Version)