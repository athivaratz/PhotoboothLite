// Frame Management Functions - Refactored for better UX
class FrameManager {
    constructor(app) {
        this.app = app;
        this.selectedFrame = null;
        this.frameSlots = [];
        this._selectedSlot = null;
        this._drawMode = false;
        this._ui = null;
        
        // SVG fallbacks
        this.fallbackSmall = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#f3f4f6"/><text x="50" y="60" text-anchor="middle" font-size="48">🖼️</text></svg>');
        this.fallbackLarge = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600"><rect width="400" height="600" fill="#f3f4f6"/><text x="200" y="320" text-anchor="middle" font-size="64">🖼️</text></svg>');
        
        setTimeout(() => this.bindEvents(), 100);
    }

    async loadFrames() {
        try {
            const response = await fetch('/api/templates');
            const data = await response.json();
            this.app.templates = data;
            this.renderFrameSelector();
        } catch (error) {
            console.error('Error loading frames:', error);
            this.app.uiUtils?.showNotification('ไม่สามารถโหลดเฟรมได้', 'error');
        }
    }

    renderFrameSelector() {
        const container = document.querySelector('#frames-panel .template-options');
        if (!container || !this.app.templates?.templates) return;

        container.innerHTML = Object.entries(this.app.templates.templates).map(([key, template]) => `
            <div class="template-option ${this.selectedFrame === key ? 'selected' : ''}" 
                 data-frame="${key}" onclick="photoApp.frameManager.selectFrame('${key}')">
                <img src="/api/frames/${template.thumbnail || template.background}" alt="${template.displayName}" 
                     onerror="this.onerror=null; this.src='data:image/svg+xml,${this.fallbackSmall}'">
                <div class="template-name">${template.displayName}</div>
                ${this.selectedFrame === key ? '<div class="frame-selected">✓</div>' : ''}
            </div>
        `).join('');
    }

    selectFrame(frameKey) {
        this.selectedFrame = frameKey;
        this._selectedSlot = null;
        this.renderFrameSelector();
        this.updateSelectedFrameName();
        this.loadFrameEditor();
    }

    updateSelectedFrameName() {
        const nameElement = document.getElementById('selected-frame-name');
        if (nameElement && this.selectedFrame && this.app.templates?.templates[this.selectedFrame]) {
            nameElement.textContent = this.app.templates.templates[this.selectedFrame].displayName;
        }
    }

    loadFrameEditor() {
        if (!this.selectedFrame || !this.app.templates?.templates[this.selectedFrame]) {
            this.showEditorPlaceholder();
            return;
        }
        const template = this.app.templates.templates[this.selectedFrame];
        this.frameSlots = JSON.parse(JSON.stringify(template.slots || []));
        this.renderFramePreview();
        this.renderSlotsConfig();
    }

    showEditorPlaceholder() {
        const preview = document.getElementById('frame-preview');
        if (preview) {
            preview.innerHTML = `
                <div class="preview-placeholder">
                    <div class="preview-icon">🖼️</div>
                    <p>เลือกเฟรมเพื่อแก้ไข mapping</p>
                </div>`;
        }
        const config = document.getElementById('slots-list');
        if (config) config.innerHTML = '<p style="text-align:center;color:#6b7280;">เลือกเฟรมก่อน</p>';
    }

    // ==================== RENDER PREVIEW ====================
    renderFramePreview(targetEl) {
        const preview = targetEl || document.getElementById('frame-preview');
        if (!preview || !this.selectedFrame) return;
        
        // Cleanup old ResizeObserver if exists
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
        
        const template = this.app.templates.templates[this.selectedFrame];
        const isModal = targetEl?.id === 'frame-preview-modal';
        
        preview.innerHTML = '';
        
        // Container - position relative for overlay
        const container = document.createElement('div');
        container.className = 'frame-editor-container';
        container.style.cssText = 'position:relative;display:inline-block;line-height:0;max-width:100%;';
        
        // Image
        const img = document.createElement('img');
        img.src = `/api/frames/${template.background}`;
        img.alt = template.displayName;
        img.draggable = false;
        img.className = 'frame-editor-image';
        img.style.cssText = `display:block;height:auto;border-radius:8px;max-width:100%;${isModal ? 'max-height:70vh;' : 'max-height:400px;'}`;
        img.onerror = () => { img.src = 'data:image/svg+xml,' + this.fallbackLarge; };
        container.appendChild(img);
        
        // Overlay - absolute positioned to match image
        const overlay = document.createElement('div');
        overlay.className = 'frame-editor-overlay';
        overlay.style.cssText = 'position:absolute;top:0;left:0;user-select:none;touch-action:none;pointer-events:auto;border-radius:8px;';
        container.appendChild(overlay);
        
        preview.appendChild(container);
        
        // Cache refs
        this._ui = { container, overlay, img, isModal };
        
        // Wait for image load then sync overlay
        const onImgReady = () => {
            this._syncOverlay();
            this._renderSlots(overlay);
            this._bindOverlayEvents(overlay, img);
            
            // Setup ResizeObserver to keep overlay synced
            this._resizeObserver = new ResizeObserver(() => {
                this._syncOverlay();
            });
            this._resizeObserver.observe(img);
        };
        
        if (img.complete && img.naturalWidth > 0) {
            setTimeout(onImgReady, 50);
        } else {
            img.onload = onImgReady;
        }
        
        this._updateDrawButton();
    }

    // Sync overlay to match image size exactly
    _syncOverlay() {
        if (!this._ui || !this._ui.img || !this._ui.overlay) return;
        const img = this._ui.img;
        const overlay = this._ui.overlay;
        
        // Get actual rendered size of image
        const w = img.offsetWidth;
        const h = img.offsetHeight;
        
        if (w > 0 && h > 0) {
            overlay.style.width = w + 'px';
            overlay.style.height = h + 'px';
        }
        overlay.style.cursor = this._drawMode ? 'crosshair' : 'default';
    }

    _renderSlots(overlay) {
        // Clear existing slots
        overlay.querySelectorAll('.slot-box').forEach(el => el.remove());
        
        this.frameSlots.forEach((slot, index) => {
            const rect = document.createElement('div');
            rect.className = 'slot-box';
            rect.dataset.index = index;
            
            const isSelected = this._selectedSlot === index;
            rect.style.cssText = `
                position:absolute;
                left:${slot.x * 100}%;
                top:${slot.y * 100}%;
                width:${slot.width * 100}%;
                height:${slot.height * 100}%;
                border:${isSelected ? '3px solid #ef4444' : '2px dashed #3b82f6'};
                background:${isSelected ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.1)'};
                border-radius:6px;
                display:flex;
                align-items:center;
                justify-content:center;
                font-weight:bold;
                font-size:1.5rem;
                color:${isSelected ? '#fff' : '#3b82f6'};
                text-shadow:${isSelected ? '0 1px 3px rgba(0,0,0,0.5)' : 'none'};
                cursor:${isSelected ? 'move' : 'pointer'};
                z-index:${isSelected ? 20 : 10};
                box-sizing:border-box;
                transition:border-color 0.15s, background 0.15s;
            `;
            rect.textContent = index + 1;
            
            // Click to select or drag
            rect.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
                if (this._drawMode) return;
                
                if (this._selectedSlot === index) {
                    this._startDragSlot(e, index);
                } else {
                    this._selectSlot(index);
                }
            });
            
            // Add resize handles if selected
            if (isSelected) {
                this._addResizeHandles(rect, index);
            }
            
            overlay.appendChild(rect);
        });
    }

    _addResizeHandles(rect, index) {
        const handles = ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'];
        const cursors = {
            nw: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', se: 'nwse-resize',
            n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize'
        };
        const positions = {
            nw: 'left:-7px;top:-7px;',
            ne: 'right:-7px;top:-7px;',
            sw: 'left:-7px;bottom:-7px;',
            se: 'right:-7px;bottom:-7px;',
            n: 'left:50%;top:-7px;transform:translateX(-50%);',
            s: 'left:50%;bottom:-7px;transform:translateX(-50%);',
            e: 'right:-7px;top:50%;transform:translateY(-50%);',
            w: 'left:-7px;top:50%;transform:translateY(-50%);'
        };
        
        handles.forEach(dir => {
            const handle = document.createElement('div');
            handle.className = 'slot-handle';
            handle.dataset.dir = dir;
            handle.style.cssText = `
                position:absolute;
                width:14px;height:14px;
                background:#fff;
                border:2px solid #ef4444;
                border-radius:50%;
                cursor:${cursors[dir]};
                z-index:30;
                box-shadow:0 1px 3px rgba(0,0,0,0.3);
                ${positions[dir]}
            `;
            handle.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
                this._startResizeSlot(e, index, dir);
            });
            rect.appendChild(handle);
        });
    }

    _bindOverlayEvents(overlay, img) {
        overlay.onpointerdown = (e) => {
            if (!this._drawMode) {
                // Click empty = deselect
                if (e.target === overlay) {
                    this._selectedSlot = null;
                    this._renderSlots(overlay);
                    this.renderSlotsConfig();
                }
                return;
            }
            // Draw mode
            this._startDrawSlot(e, overlay, img);
        };
    }

    // ==================== DRAW NEW SLOT ====================
    _startDrawSlot(e, overlay, img) {
        if (e.button !== 0) return;
        e.preventDefault();
        
        const imgRect = img.getBoundingClientRect();
        const toRel = (clientX, clientY) => ({
            x: Math.max(0, Math.min(1, (clientX - imgRect.left) / imgRect.width)),
            y: Math.max(0, Math.min(1, (clientY - imgRect.top) / imgRect.height))
        });
        
        const start = toRel(e.clientX, e.clientY);
        
        // Temp rectangle
        const tempRect = document.createElement('div');
        tempRect.className = 'slot-drawing';
        tempRect.style.cssText = `
            position:absolute;
            border:3px solid #10b981;
            background:rgba(16,185,129,0.2);
            border-radius:6px;
            z-index:50;
            pointer-events:none;
        `;
        overlay.appendChild(tempRect);
        
        const updateTemp = (cur) => {
            const x = Math.min(start.x, cur.x);
            const y = Math.min(start.y, cur.y);
            const w = Math.abs(cur.x - start.x);
            const h = Math.abs(cur.y - start.y);
            tempRect.style.left = (x * 100) + '%';
            tempRect.style.top = (y * 100) + '%';
            tempRect.style.width = (w * 100) + '%';
            tempRect.style.height = (h * 100) + '%';
        };
        
        const onMove = (ev) => {
            const cur = toRel(ev.clientX, ev.clientY);
            updateTemp(cur);
        };
        
        const onUp = (ev) => {
            overlay.removeEventListener('pointermove', onMove);
            overlay.releasePointerCapture(e.pointerId);
            tempRect.remove();
            
            const end = toRel(ev.clientX, ev.clientY);
            const x = Math.min(start.x, end.x);
            const y = Math.min(start.y, end.y);
            const w = Math.abs(end.x - start.x);
            const h = Math.abs(end.y - start.y);
            
            // Minimum 1% size
            if (w > 0.01 && h > 0.01) {
                this.frameSlots.push({ x, y, width: w, height: h });
                this._selectedSlot = this.frameSlots.length - 1;
                this.app.uiUtils?.showNotification(`✅ เพิ่ม Slot ${this.frameSlots.length}`, 'success');
            }
            
            this._renderSlots(overlay);
            this.renderSlotsConfig();
        };
        
        overlay.setPointerCapture(e.pointerId);
        overlay.addEventListener('pointermove', onMove);
        overlay.addEventListener('pointerup', onUp, { once: true });
    }

    // ==================== DRAG SLOT ====================
    _startDragSlot(e, index) {
        if (e.button !== 0) return;
        e.preventDefault();
        
        const overlay = this._ui.overlay;
        const img = this._ui.img;
        const imgRect = img.getBoundingClientRect();
        const slot = this.frameSlots[index];
        
        const startMouse = { x: e.clientX, y: e.clientY };
        const startSlot = { x: slot.x, y: slot.y };
        
        const onMove = (ev) => {
            const dx = (ev.clientX - startMouse.x) / imgRect.width;
            const dy = (ev.clientY - startMouse.y) / imgRect.height;
            
            slot.x = Math.max(0, Math.min(1 - slot.width, startSlot.x + dx));
            slot.y = Math.max(0, Math.min(1 - slot.height, startSlot.y + dy));
            
            this._renderSlots(overlay);
        };
        
        const onUp = () => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            this.renderSlotsConfig();
        };
        
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
    }

    // ==================== RESIZE SLOT ====================
    _startResizeSlot(e, index, dir) {
        e.preventDefault();
        
        const overlay = this._ui.overlay;
        const img = this._ui.img;
        const imgRect = img.getBoundingClientRect();
        const slot = this.frameSlots[index];
        
        const startMouse = { x: e.clientX, y: e.clientY };
        const startSlot = { x: slot.x, y: slot.y, w: slot.width, h: slot.height };
        const minSize = 0.02;
        
        const onMove = (ev) => {
            const dx = (ev.clientX - startMouse.x) / imgRect.width;
            const dy = (ev.clientY - startMouse.y) / imgRect.height;
            
            let { x, y, w, h } = startSlot;
            
            if (dir.includes('w')) { x += dx; w -= dx; }
            if (dir.includes('e')) { w += dx; }
            if (dir.includes('n')) { y += dy; h -= dy; }
            if (dir.includes('s')) { h += dy; }
            
            // Enforce minimum
            if (w < minSize) { if (dir.includes('w')) x = startSlot.x + startSlot.w - minSize; w = minSize; }
            if (h < minSize) { if (dir.includes('n')) y = startSlot.y + startSlot.h - minSize; h = minSize; }
            
            // Clamp
            if (x < 0) { w += x; x = 0; }
            if (y < 0) { h += y; y = 0; }
            if (x + w > 1) w = 1 - x;
            if (y + h > 1) h = 1 - y;
            
            slot.x = x; slot.y = y; slot.width = w; slot.height = h;
            this._renderSlots(overlay);
        };
        
        const onUp = () => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            this.renderSlotsConfig();
        };
        
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
    }

    // ==================== SELECT SLOT ====================
    _selectSlot(index) {
        this._selectedSlot = index;
        this._drawMode = false;
        
        const target = this._ui?.isModal ? document.getElementById('frame-preview-modal') : null;
        this.renderFramePreview(target);
        this.renderSlotsConfig();
        this._updateDrawButton();
    }

    // ==================== SLOTS CONFIG LIST ====================
    renderSlotsConfig() {
        // Render both main panel and modal sidebar
        const containers = [
            document.getElementById('slots-list'),
            document.getElementById('modal-slots-list')
        ].filter(Boolean);
        
        if (containers.length === 0) return;
        
        const html = this.frameSlots.length === 0 
            ? `<div style="text-align:center;padding:30px 15px;color:#6b7280;">
                    <div style="font-size:2rem;margin-bottom:10px;">📐</div>
                    <p style="margin:0 0 8px 0;font-weight:500;">ยังไม่มี Slot</p>
                    <p style="font-size:0.85rem;margin:0;">กด "✏️ วาด Slot" แล้วลากบนรูปเฟรม</p>
                </div>`
            : this.frameSlots.map((slot, index) => {
                const isSelected = this._selectedSlot === index;
                const pct = (v) => (v * 100).toFixed(1) + '%';
                return `
                    <div class="slot-item ${isSelected ? 'active' : ''}" onclick="photoApp.frameManager._selectSlot(${index})">
                        <div class="slot-item-header">
                            <span class="slot-item-title">📍 Slot ${index + 1}</span>
                            <button class="btn danger btn-sm" onclick="event.stopPropagation();photoApp.frameManager.removeSlot(${index})">🗑️</button>
                        </div>
                        <div class="slot-item-coords">
                            <span>X: ${pct(slot.x)}</span>
                            <span>Y: ${pct(slot.y)}</span>
                            <span>W: ${pct(slot.width)}</span>
                            <span>H: ${pct(slot.height)}</span>
                        </div>
                    </div>`;
            }).join('');
        
        containers.forEach(c => c.innerHTML = html);
    }

    // ==================== ACTIONS ====================
    addSlot() {
        if (!this.selectedFrame) {
            this.app.uiUtils?.showNotification('กรุณาเลือกเฟรมก่อน', 'warning');
            return;
        }
        this.openEditorModal({ drawMode: true });
    }

    removeSlot(index) {
        if (index < 0 || index >= this.frameSlots.length) return;
        this.frameSlots.splice(index, 1);
        if (this._selectedSlot === index) this._selectedSlot = null;
        else if (this._selectedSlot > index) this._selectedSlot--;
        
        const target = this._ui?.isModal ? document.getElementById('frame-preview-modal') : null;
        this.renderFramePreview(target);
        this.renderSlotsConfig();
        this.app.uiUtils?.showNotification('ลบ Slot แล้ว', 'success');
    }

    resetMapping() {
        if (!confirm('รีเซ็ต mapping กลับเป็นค่าเดิม?')) return;
        if (this.selectedFrame && this.app.templates?.templates[this.selectedFrame]) {
            const template = this.app.templates.templates[this.selectedFrame];
            this.frameSlots = JSON.parse(JSON.stringify(template.slots || []));
            this._selectedSlot = null;
            
            const target = this._ui?.isModal ? document.getElementById('frame-preview-modal') : null;
            this.renderFramePreview(target);
            this.renderSlotsConfig();
            this.app.uiUtils?.showNotification('รีเซ็ต mapping แล้ว', 'success');
        }
    }

    async saveFrameMapping() {
        if (!this.selectedFrame) {
            this.app.uiUtils?.showNotification('เลือกเฟรมก่อน', 'warning');
            return;
        }
        
        try {
            const response = await fetch('/api/save-frame-mapping', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    frameKey: this.selectedFrame,
                    slots: this.frameSlots
                })
            });

            if (response.ok) {
                this.app.templates.templates[this.selectedFrame].slots = JSON.parse(JSON.stringify(this.frameSlots));
                this.app.uiUtils?.showNotification('💾 บันทึก Mapping สำเร็จ!', 'success');
            } else {
                throw new Error('Save failed');
            }
        } catch (error) {
            console.error('Error saving:', error);
            this.app.uiUtils?.showNotification('เกิดข้อผิดพลาด', 'error');
        }
    }

    // ==================== DRAW MODE ====================
    toggleDrawMode() {
        this._drawMode = !this._drawMode;
        this._selectedSlot = null;
        
        const target = this._ui?.isModal ? document.getElementById('frame-preview-modal') : null;
        this.renderFramePreview(target);
        this.renderSlotsConfig();
        this._updateDrawButton();
        
        if (this._drawMode) {
            this.app.uiUtils?.showNotification('🎨 โหมดวาด: คลิกแล้วลากเพื่อวาด Slot', 'info');
        }
    }

    _updateDrawButton() {
        const btn = document.getElementById('btn-toggle-draw');
        if (btn) {
            if (this._drawMode) {
                btn.classList.add('primary', 'active');
                btn.innerHTML = '🎨 กำลังวาด...';
            } else {
                btn.classList.remove('primary', 'active');
                btn.innerHTML = '✏️ วาด Slot';
            }
        }
    }

    // ==================== MODAL ====================
    openEditorModal(options = {}) {
        if (!this.selectedFrame) {
            this.app.uiUtils?.showNotification('กรุณาเลือกเฟรมก่อน', 'warning');
            return;
        }
        
        if (options.drawMode) {
            this._drawMode = true;
            this._selectedSlot = null;
        }
        
        const modal = document.getElementById('frame-editor-modal');
        const target = document.getElementById('frame-preview-modal');
        if (!modal || !target) return;
        
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        
        // Update UI
        const title = modal.querySelector('.modal-title');
        const instructions = modal.querySelector('.modal-instructions');
        if (title) title.textContent = this._drawMode ? '🎨 วาด Slot ใหม่' : '✏️ ตัวแก้ไขเฟรม';
        if (instructions) {
            instructions.textContent = this._drawMode 
                ? '🖱️ คลิกแล้วลากเพื่อวาด Slot ใหม่ | วาดได้หลายอันต่อเนื่อง'
                : '🖱️ คลิก Slot เพื่อเลือก → ลากเพื่อย้าย → ลากมุมเพื่อปรับขนาด → กด Delete ลบ';
        }
        
        this.renderFramePreview(target);
        this._updateDrawButton();
        
        // ESC to close
        this._escHandler = (ev) => {
            if (ev.key === 'Escape') this.closeEditorModal(true);
        };
        window.addEventListener('keydown', this._escHandler);
    }

    closeEditorModal(save = false) {
        const modal = document.getElementById('frame-editor-modal');
        const target = document.getElementById('frame-preview-modal');
        if (!modal) return;
        
        // Cleanup ResizeObserver
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
        
        this._drawMode = false;
        this._selectedSlot = null;
        
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        if (target) target.innerHTML = '';
        
        if (this._escHandler) {
            window.removeEventListener('keydown', this._escHandler);
        }
        
        this.renderFramePreview();
        this.renderSlotsConfig();
        this._updateDrawButton();
        
        if (save && this.frameSlots.length > 0) {
            this.app.uiUtils?.showNotification('✅ อัปเดตการแก้ไขแล้ว (อย่าลืมกดบันทึก)', 'info');
        }
    }

    // ==================== IMPORT / DELETE ====================
    async openImportDialog() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.jpg,.jpeg,.png';
        
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;

            const displayName = prompt('ชื่อเฟรม:', file.name.replace(/\.[^.]+$/, '')) || file.name;
            const templateKey = prompt('คีย์ (ภาษาอังกฤษ/ตัวเลข) หรือปล่อยว่าง:', '') || '';

            const formData = new FormData();
            formData.append('file', file);
            formData.append('displayName', displayName);
            formData.append('templateKey', templateKey);

            try {
                const res = await fetch('/api/frames/import', { method: 'POST', body: formData });
                if (!res.ok) throw new Error(await res.text());
                
                const data = await res.json();
                this.app.uiUtils?.showNotification('นำเข้าเฟรมสำเร็จ', 'success');
                
                await this.loadFrames();
                await this.app.photoBoothCreator?.loadTemplates();
                
                if (data.templateKey) this.selectFrame(data.templateKey);
            } catch (err) {
                console.error('Import error:', err);
                this.app.uiUtils?.showNotification('นำเข้าเฟรมล้มเหลว', 'error');
            }
        };
        
        input.click();
    }

    async deleteSelectedTemplate() {
        if (!this.selectedFrame) {
            this.app.uiUtils?.showNotification('เลือกเฟรมก่อน', 'warning');
            return;
        }
        
        const name = this.app.templates?.templates[this.selectedFrame]?.displayName || this.selectedFrame;
        if (!confirm(`ลบเทมเพลต "${name}" ?`)) return;
        
        try {
            const res = await fetch(`/api/templates/${encodeURIComponent(this.selectedFrame)}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(await res.text());
            
            const data = await res.json();
            this.app.uiUtils?.showNotification('ลบเทมเพลตสำเร็จ', 'success');
            
            await this.loadFrames();
            await this.app.photoBoothCreator?.loadTemplates();
            
            const keys = Object.keys(this.app.templates?.templates || {});
            if (keys.length > 0) {
                this.selectFrame(data.current_template || keys[0]);
            } else {
                this.selectedFrame = null;
                this.updateSelectedFrameName();
                this.showEditorPlaceholder();
            }
        } catch (err) {
            console.error('Delete error:', err);
            this.app.uiUtils?.showNotification('ลบเทมเพลตล้มเหลว', 'error');
        }
    }

    // ==================== BIND EVENTS ====================
    bindEvents() {
        // Buttons
        document.getElementById('btn-load-frame-editor')?.addEventListener('click', () => this.openEditorModal());
        document.getElementById('btn-save-frame-mapping')?.addEventListener('click', () => this.saveFrameMapping());
        document.getElementById('btn-add-slot')?.addEventListener('click', () => this.addSlot());
        document.getElementById('btn-reset-mapping')?.addEventListener('click', () => this.resetMapping());
        document.getElementById('btn-import-frame')?.addEventListener('click', () => this.openImportDialog());
        document.getElementById('btn-delete-template')?.addEventListener('click', () => this.deleteSelectedTemplate());

        // Modal controls
        const modal = document.getElementById('frame-editor-modal');
        if (modal) {
            document.getElementById('btn-close-frame-modal')?.addEventListener('click', () => this.closeEditorModal());
            document.getElementById('btn-done-frame-modal')?.addEventListener('click', () => this.closeEditorModal(true));
            document.getElementById('btn-toggle-draw')?.addEventListener('click', () => this.toggleDrawMode());
            
            modal.querySelector('.modal-backdrop')?.addEventListener('click', (e) => {
                if (e.target.classList.contains('modal-backdrop')) this.closeEditorModal(true);
            });
        }

        // Global keyboard - Delete slot
        window.addEventListener('keydown', (ev) => {
            const modal = document.getElementById('frame-editor-modal');
            const isModalOpen = modal && !modal.classList.contains('hidden');
            const framesPanel = document.getElementById('frames-panel');
            const isPanelActive = framesPanel?.classList.contains('active');
            
            if ((isModalOpen || isPanelActive) && this._selectedSlot !== null) {
                if ((ev.key === 'Delete' || ev.key === 'Backspace') && 
                    ev.target.tagName !== 'INPUT' && ev.target.tagName !== 'TEXTAREA') {
                    ev.preventDefault();
                    this.removeSlot(this._selectedSlot);
                }
            }
        });

        // Window resize
        window.addEventListener('resize', () => {
            if (this._ui && this.selectedFrame) {
                const target = this._ui.isModal ? document.getElementById('frame-preview-modal') : null;
                setTimeout(() => this.renderFramePreview(target), 100);
            }
        });
        
        console.log('FrameManager events bound');
    }
}

window.FrameManager = FrameManager;
console.log('FrameManager loaded');
