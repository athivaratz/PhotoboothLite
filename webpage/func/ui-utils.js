// UI Utilities for PhotoBooth Lite
class UIUtils {
    constructor(app) {
        this.app = app;
        this.initializeUIComponents();
        console.log('UIUtils initialized');
    }

    initializeUIComponents() {
        // Initialize any UI components
        this.bindEvents();
    }

    // Tab switching functionality
    switchTab(tabName) {
        console.log('Switching to tab:', tabName);
        
        // Hide all tab panels
        const tabPanels = document.querySelectorAll('.tab-panel');
        tabPanels.forEach(panel => {
            panel.classList.remove('active');
        });

        // Remove active class from all tab buttons
        const tabButtons = document.querySelectorAll('.tab');
        tabButtons.forEach(button => {
            button.classList.remove('active');
        });

        // Show selected tab panel
        const selectedPanel = document.getElementById(tabName + '-panel');
        if (selectedPanel) {
            selectedPanel.classList.add('active');
        }

        // Add active class to selected tab button
        const selectedButton = document.querySelector(`[data-tab="${tabName}"]`);
        if (selectedButton) {
            selectedButton.classList.add('active');
        }

        // Update current tab in app
        if (window.photoApp) {
            window.photoApp.currentTab = tabName;
        }

        console.log(`Switched to ${tabName} tab`);
    }

    // Show notification to user
    showNotification(message, type = 'info') {
        console.log(`Notification [${type}]: ${message}`);
        
        // Remove existing notifications
        document.querySelectorAll('.notification').forEach(n => n.remove());
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Add to page
        document.body.appendChild(notification);
        
        // Trigger slide-in animation
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                notification.classList.add('show');
            });
        });
        
        // Auto remove after 4 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 400);
        }, 4000);
    }

    // Bind global events
    bindEvents() {
        // Tab switching event listeners
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('tab') && e.target.dataset.tab) {
                this.switchTab(e.target.dataset.tab);
            }
        });

        // ESC key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });
    }

    // Close all open modals
    closeAllModals() {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            modal.style.display = 'none';
        });
    }

    // Format file size
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Format date
    formatDate(date) {
        return new Date(date).toLocaleDateString('th-TH', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // Get element by ID with error handling
    getElementById(id) {
        const element = document.getElementById(id);
        if (!element) {
            console.warn(`Element with ID '${id}' not found`);
        }
        return element;
    }

    // Toggle element visibility
    toggleVisibility(elementId) {
        const element = this.getElementById(elementId);
        if (element) {
            const isVisible = element.style.display !== 'none';
            element.style.display = isVisible ? 'none' : 'block';
            return !isVisible;
        }
        return false;
    }

    // Disable/enable button
    setButtonState(buttonId, disabled) {
        const button = this.getElementById(buttonId);
        if (button) {
            button.disabled = disabled;
            button.style.opacity = disabled ? '0.5' : '1';
        }
    }

    // Loading state management
    showLoading(elementId) {
        const element = this.getElementById(elementId);
        if (element) {
            element.innerHTML = '<div class="loading">กำลังโหลด...</div>';
        }
    }

    hideLoading(elementId) {
        const element = this.getElementById(elementId);
        if (element) {
            const loading = element.querySelector('.loading');
            if (loading) {
                loading.remove();
            }
        }
    }
}

// Make UIUtils available globally
window.UIUtils = UIUtils;
console.log('UIUtils class loaded and available globally');
