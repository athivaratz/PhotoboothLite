// PhotoBooth Creator Functions
class PhotoBoothCreator {
    constructor(app) {
        this.app = app;
        setTimeout(() => this.bindUI(), 100);
    }

    // Load templates list
    async loadTemplates() {
        try {
            const resp = await fetch('/api/templates');
            this.app.templates = await resp.json();
            this.renderTemplateOptions();
            this.renderCreatorSelect();
            if (this.app.currentTemplate) this.setupPhotoSlots();
        } catch (e) {
            console.error('Error loading templates:', e);
        }
    }

    // Load current template selection
    async loadCurrentTemplate() {
        try {
            const resp = await fetch('/api/current-template');
            const data = await resp.json();
            this.app.currentTemplate = data.currentTemplate || this.app.templates?.current_template || Object.keys(this.app.templates?.templates || {})[0] || null;
            if (this.app.templates?.templates) {
                this.setupPhotoSlots();
                this.renderTemplateOptions();
                this.renderCreatorSelect();
            }
        } catch (e) {
            console.error('Error loading current template:', e);
        }
    }

    bindUI() {
        const select = document.getElementById('creator-frame-select');
        if (select) {
            select.addEventListener('change', (e) => {
                const key = e.target.value;
                if (key) this.selectTemplate(key);
            });
        }
        const btnLoad = document.getElementById('btn-load-creator');
        if (btnLoad) {
            btnLoad.addEventListener('click', () => {
                const sel = document.getElementById('creator-frame-select');
                const key = sel && sel.value;
                if (key) this.selectTemplate(key);
                else this.app.uiUtils?.showNotification('กรุณาเลือกเฟรม', 'warning');
            });
        }
        const btnAuto = document.getElementById('btn-auto-fill');
        if (btnAuto) btnAuto.addEventListener('click', () => this.autoFillSlots());
        const btnClear = document.getElementById('btn-clear-slots');
        if (btnClear) btnClear.addEventListener('click', () => this.clearAllSlots());
        const btnGen = document.getElementById('btn-generate-photobooth');
        if (btnGen) btnGen.addEventListener('click', () => this.createPhotobooth());
    }

    renderCreatorSelect() {
        const select = document.getElementById('creator-frame-select');
        if (!select) return;
        select.innerHTML = '<option value="">-- เลือกเฟรม --</option>';
        if (!this.app.templates?.templates) return;
        for (const [key, tpl] of Object.entries(this.app.templates.templates)) {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = tpl.displayName || key;
            if (this.app.currentTemplate === key) opt.selected = true;
            select.appendChild(opt);
        }
    }

    renderTemplateOptions() {
        const container = document.getElementById('template-options');
        if (!container) return;
        if (!this.app.templates?.templates) {
            container.innerHTML = '<p>กำลังโหลดเฟรม...</p>';
            return;
        }
        container.innerHTML = Object.entries(this.app.templates.templates)
            .map(([key, template]) => `
                <div class="template-option ${this.app.currentTemplate === key ? 'selected' : ''}" onclick="photoApp.photoBoothCreator.selectTemplate('${key}')">
                    <img src="/api/frames/${template.thumbnail || template.background}" alt="${template.displayName}">
                    <div class="template-name">${template.displayName}</div>
                </div>
            `).join('');
    }

    selectTemplate(templateKey) {
        this.app.currentTemplate = templateKey;
        this.app.slotAssignments = {};
        this.app.selectedSlot = null;
        this.setupPhotoSlots();
        this.renderTemplateOptions();
        this.app.uiUtils?.showNotification(`เลือกเฟรม: ${templateKey}`, 'success');
        fetch('/api/current-template', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template: templateKey }) });
    }

    // Build slot UI
    setupPhotoSlots() {
        const container = document.getElementById('slots-assignment');
        if (!container) return;
        const tpl = this.app.templates?.templates?.[this.app.currentTemplate];
        if (!tpl) {
            container.innerHTML = `
                <h4>🎯 จัดเรียงรูปใน Slots:</h4>
                <div class="assignment-placeholder"><p>เลือกเฟรมเพื่อเริ่มการจัดเรียงรูป</p></div>`;
            return;
        }
        const slots = tpl.slots || [];
        container.innerHTML = `
            <h4>🎯 จัดเรียงรูปใน Slots:</h4>
            <div class="photo-slots" id="photo-slots">
                ${slots.map((slot, index) => `
                    <div class="photo-slot" data-slot="${index}" onclick="photoApp.photoBoothCreator.selectSlot(${index})">
                        <div class="slot-number">${index + 1}</div>
                        <div class="slot-content">
                            ${this.app.slotAssignments[index]
                                ? `<img src="/api/photos/${encodeURIComponent(this.app.slotAssignments[index])}/thumbnail" alt="${this.app.slotAssignments[index]}">
                                     <button class="clear-slot" onclick="photoApp.photoBoothCreator.clearSlot(${index}); event.stopPropagation();">×</button>`
                                : 'ลากรูปมาวางที่นี่'}
                        </div>
                    </div>
                `).join('')}
            </div>`;
        this.updateCreateButton();
        this.loadAvailablePhotos();
    }

    selectSlot(slotIndex) {
        this.app.selectedSlot = slotIndex;
        document.querySelectorAll('.photo-slot').forEach((el, idx) => el.classList.toggle('selected', idx === slotIndex));
        this.app.uiUtils?.showNotification(`เลือก slot ${slotIndex + 1}`, 'info');
    }

    clearSlot(slotIndex) {
        delete this.app.slotAssignments[slotIndex];
        this.setupPhotoSlots();
        this.app.uiUtils?.showNotification(`เคลียร์ slot ${slotIndex + 1}`, 'info');
    }

    clearAllSlots() {
        this.app.slotAssignments = {};
        this.app.selectedSlot = null;
        this.setupPhotoSlots();
        this.app.uiUtils?.showNotification('เคลียร์ทุก slot แล้ว', 'info');
    }

    updateCreateButton() {
        const btn = document.getElementById('btn-generate-photobooth');
        if (!btn) return;
        const tpl = this.app.templates?.templates?.[this.app.currentTemplate];
        const required = tpl?.slots?.length || 0;
        const filled = Object.keys(this.app.slotAssignments).length;
        btn.disabled = filled < required;
        btn.textContent = `สร้างโฟโต้บูท (${filled}/${required})`;
    }

    // Load photos list used for assignment
    async loadAvailablePhotos() {
        try {
            const resp = await fetch('/api/photos?page=1&pageSize=100');
            const data = await resp.json();
            this.app.availablePhotos = data.photos || [];
            this.renderAvailablePhotos();
        } catch (e) {
            console.error('Error loading available photos:', e);
        }
    }

    renderAvailablePhotos() {
        const container = document.getElementById('selector-photos');
        if (!container) return;
        container.innerHTML = `
            <div class="available-photos">
                ${this.app.availablePhotos.map(p => `
                    <div class="available-photo" draggable="true" data-filename="${p.filename}" ondragstart="photoApp.photoBoothCreator.handleDragStart(event)" onclick="photoApp.photoBoothCreator.assignToSelectedSlot('${p.filename}')">
                        <img src="/api/photos/${encodeURIComponent(p.filename)}/thumbnail" alt="${p.filename}">
                        <div class="photo-name">${p.filename}</div>
                    </div>`).join('')}
            </div>`;
    }

    handleDragStart(event) {
        if (event?.target?.dataset?.filename) {
            event.dataTransfer.setData('text/plain', event.target.dataset.filename);
        }
    }

    assignToSelectedSlot(filename) {
        if (this.app.selectedSlot !== null) {
            this.app.slotAssignments[this.app.selectedSlot] = filename;
            this.setupPhotoSlots();
        }
    }

    autoFillSlots() {
        const tpl = this.app.templates?.templates?.[this.app.currentTemplate];
        if (!tpl) return;
        const slots = tpl.slots || [];
        const available = this.app.availablePhotos.slice();
        let filled = 0;
        slots.forEach((_, idx) => {
            if (!this.app.slotAssignments[idx] && available.length) {
                this.app.slotAssignments[idx] = available.shift().filename;
                filled++;
            }
        });
        this.setupPhotoSlots();
        this.app.uiUtils?.showNotification(
            filled ? `เติมรูปอัตโนมัติ ${filled} slots` : 'ไม่มีรูปหรือ slot ว่างสำหรับเติม',
            filled ? 'success' : 'warning'
        );
    }

        // Create composite and show preview (no auto-download)
    async createPhotobooth() {
        try {
            const tpl = this.app.templates?.templates?.[this.app.currentTemplate];
            if (!tpl) return this.app.uiUtils?.showNotification('กรุณาเลือกเทมเพลต', 'error');

            const slots = (tpl.slots || []).map((s, idx) => ({
                x: s.x,
                y: s.y,
                width: s.width,
                height: s.height,
                photo: this.app.slotAssignments[idx] || null
            }));

            const filled = slots.filter(s => !!s.photo).length;
            if (!filled) return this.app.uiUtils?.showNotification('กรุณาเลือกรูปใส่ช่อง', 'error');

            const btn = document.getElementById('btn-generate-photobooth');
            if (btn) { btn.disabled = true; btn.textContent = 'กำลังสร้าง...'; }

            const resp = await fetch('/api/create-photobooth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    template: { background: tpl.background, commentBox: tpl.commentBox },
                    slots,
                    comment: (document.getElementById('comment-input')?.value || '').trim() || undefined
                })
            });

            if (!resp.ok) {
                const txt = await resp.text();
                this.app.uiUtils?.showNotification(txt || 'การสร้างโฟโต้บูทล้มเหลว', 'error');
                return;
            }

                    const blob = await resp.blob();
                    // Revoke old preview URL if exists
                    if (this.previewUrl) {
                        try { URL.revokeObjectURL(this.previewUrl); } catch (_) {}
                    }
                    this.previewBlob = blob;
                    this.previewUrl = URL.createObjectURL(blob);

                    // Render preview and actions
                    const previewEl = document.getElementById('photobooth-preview');
                    if (previewEl) {
                        previewEl.innerHTML = `
                            <div class="preview-card">
                                <img src="${this.previewUrl}" alt="Photobooth Preview" class="preview-image"/>
                                <div class="preview-actions">
                                    <button class="btn success" onclick="photoApp.photoBoothCreator.downloadPreview()">⬇️ ดาวน์โหลด</button>
                                    <button class="btn" onclick="photoApp.photoBoothCreator.openPreview()">🔍 เปิดภาพ</button>
                                    <button class="btn" onclick="photoApp.photoBoothCreator.sharePreview()">📤 แชร์</button>
                                    <button class="btn danger" onclick="photoApp.photoBoothCreator.clearPreview()">🗑️ ล้างตัวอย่าง</button>
                                </div>
                            </div>`;
                    }

                    this.app.uiUtils?.showNotification('สร้างโฟโต้บูทสำเร็จ แสดงตัวอย่างแล้ว', 'success');
        } catch (e) {
            console.error('Error creating photobooth:', e);
            this.app.uiUtils?.showNotification('การสร้างโฟโต้บูทล้มเหลว', 'error');
        } finally {
            const btn = document.getElementById('btn-generate-photobooth');
            if (btn) { btn.disabled = false; this.updateCreateButton(); }
        }
    }

            // --- Preview actions ---
            downloadPreview() {
                if (!this.previewUrl) return;
                const a = document.createElement('a');
                a.href = this.previewUrl;
                a.download = `photobooth_${Date.now()}.jpg`;
                document.body.appendChild(a);
                a.click();
                a.remove();
            }

            openPreview() {
                if (!this.previewUrl) return;
                window.open(this.previewUrl, '_blank');
            }

            async sharePreview() {
                try {
                    if (navigator.share && navigator.canShare && this.previewBlob) {
                        const file = new File([this.previewBlob], `photobooth_${Date.now()}.jpg`, { type: 'image/jpeg' });
                        if (navigator.canShare({ files: [file] })) {
                            await navigator.share({ files: [file], title: 'Photobooth', text: 'Photobooth Preview' });
                            return;
                        }
                    }
                    // Fallback: open preview in new tab if Web Share not available
                    this.openPreview();
                } catch (err) {
                    console.warn('Share failed or not supported, opening instead:', err);
                    this.openPreview();
                }
            }

            clearPreview() {
                const previewEl = document.getElementById('photobooth-preview');
                if (previewEl) {
                    previewEl.innerHTML = `
                        <div class="preview-placeholder">
                            <div class="preview-icon">🖼️</div>
                            <p>ตัวอย่างจะแสดงที่นี่เมื่อสร้างโฟโต้บูท</p>
                        </div>`;
                }
                if (this.previewUrl) {
                    try { URL.revokeObjectURL(this.previewUrl); } catch (_) {}
                }
                this.previewUrl = null;
                this.previewBlob = null;
            }

    // Backward compatibility alias
    assignPhotoToSlot(filename) { this.assignToSelectedSlot(filename); }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PhotoBoothCreator;
}
