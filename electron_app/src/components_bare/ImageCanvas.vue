<template>
    <div ref="viewport" class="image-viewport" tabindex="0" aria-label="Image editor. B brush, E eraser, H pan, Space to pan, brackets to resize brush."
        @wheel.prevent="wheel_zoom" @keydown="keydown" @keyup.space.prevent="space_pan = false" @blur="cancel_gesture"
        @pointerdown="pointer_down" @pointermove="pointer_move" @pointerup="pointer_up" @pointercancel="cancel_gesture" @lostpointercapture="cancel_gesture"
        @pointerleave="cursor_visible = false" :style="{cursor: tool === 'pan' || space_pan ? (flag ? 'grabbing' : 'grab') : 'crosshair'}">
        <div class="image-stack" :style="view_style">
            <canvas :id="canvas_d_id"></canvas>
            <canvas :id="canvas_id" :style="{opacity: show_mask && !compare_source ? mask_opacity : 0}"></canvas>
            <img v-if="compare_source" :src="image_url(compare_source)" alt="Before this edit" class="comparison">
        </div>
        <div v-if="cursor_visible && ['brush','eraser'].includes(tool) && !space_pan && is_ready && !is_disabled" class="brush-cursor"
            :style="{width: cursor_size+'px',height:cursor_size+'px',left:cursor_x+'px',top:cursor_y+'px'}"></div>
    </div>
</template>
<script>
function loadImage(src) {
    return new Promise((resolve, reject) => {
        const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src;
    });
}
export default {
    name: 'ImageCanvas',
    props: {
        image_source: String, is_inpaint: Boolean, is_disabled: Boolean,
        canvas_d_id: String, canvas_id: String, stroke_size_no: String, on_img_load: Function,
        tool: {type: String, default: 'brush'}, show_mask: {type: Boolean, default: true},
        mask_opacity: {type: Number, default: 0.45}, compare_source: String
    },
    data() {
        return {img_tag: undefined, is_ready: false, flag: false, is_something_drawn: false,
            stroke_color: '#f04b82', zoom: 1, fit_scale: 1, pan_x: 0, pan_y: 0,
            viewport_width: 0, viewport_height: 0, space_pan: false, gesture: null,
            cursor_visible: false, cursor_x: 0, cursor_y: 0, prevX: 0, prevY: 0,
            mask_undo: [], mask_redo: [], image_width: 0, image_height: 0};
    },
    computed: {
        scale() { return this.fit_scale * this.zoom; },
        stroke_size() { return Number(this.stroke_size_no || 30) / 2; },
        cursor_size() { return this.stroke_size * 2 * this.scale; },
        view_style() {
            return {width: this.image_width+'px', height: this.image_height+'px',
                transform: `translate(${this.viewport_width/2 + this.pan_x}px, ${this.viewport_height/2 + this.pan_y}px) scale(${this.scale}) translate(-50%, -50%)`};
        }
    },
    mounted() {
        this.canvas = document.getElementById(this.canvas_id);
        this.canvasD = document.getElementById(this.canvas_d_id);
        this.ctx = this.canvas.getContext('2d');
        this.ro = new ResizeObserver(() => {
            cancelAnimationFrame(this.resize_frame);
            this.resize_frame = requestAnimationFrame(this.on_resize);
        });
        this.ro.observe(this.$refs.viewport);
        window.addEventListener('blur', this.cancel_gesture);
        if (this.image_source) this.on_img_change();
    },
    beforeDestroy() {
        this.ro.disconnect(); cancelAnimationFrame(this.resize_frame); window.removeEventListener('blur', this.cancel_gesture);
        this.image_load_id = (this.image_load_id || 0) + 1;
    },
    methods: {
        image_url(source) { return source.startsWith('file://') ? source : 'file://' + source.split('/').map(encodeURIComponent).join('/'); },
        on_resize() {
            const el = this.$refs.viewport;
            const width = el.clientWidth, height = el.clientHeight;
            const fit = this.img_tag && width && height ? Math.min(width / this.image_width, height / this.image_height) : this.fit_scale;
            if (width === this.viewport_width && height === this.viewport_height && fit === this.fit_scale) return;
            this.viewport_width = width; this.viewport_height = height; this.fit_scale = fit;
            this.emit_view();
        },
        emit_view() { this.$emit('view-change', {zoom: this.zoom, percent: Math.round(this.scale*100)}); },
        zoom_to(value, x = this.viewport_width/2, y = this.viewport_height/2) {
            const next = Math.max(0.25, Math.min(16, value));
            const ratio = next / this.zoom;
            this.pan_x = x - this.viewport_width/2 - (x - this.viewport_width/2 - this.pan_x) * ratio;
            this.pan_y = y - this.viewport_height/2 - (y - this.viewport_height/2 - this.pan_y) * ratio;
            this.zoom = next; this.emit_view();
        },
        wheel_zoom(e) {
            if (!this.is_ready || this.flag) return;
            const r = this.$refs.viewport.getBoundingClientRect();
            this.zoom_to(this.zoom * Math.exp(-e.deltaY * 0.002), e.clientX-r.left, e.clientY-r.top);
        },
        fit_view() { this.zoom = 1; this.pan_x = this.pan_y = 0; this.emit_view(); },
        actual_size() { this.zoom_to(1 / this.fit_scale); },
        keydown(e) {
            if (e.code === 'Space') { e.preventDefault(); this.space_pan = true; }
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault(); if (e.shiftKey) this.redo_mask(); else this.undo_mask();
            }
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            const tools = {b: 'brush', e: 'eraser', h: 'pan', m: 'rectangle'};
            if (tools[e.key.toLowerCase()]) this.$emit('tool-change', tools[e.key.toLowerCase()]);
            if (e.key === '[' || e.key === ']') this.$emit('brush-change', Math.max(1, Math.min(300, Number(this.stroke_size_no || 30) + (e.key === '[' ? -5 : 5))));
        },
        point(e) {
            const r = this.canvas.getBoundingClientRect();
            return {x: (e.clientX-r.left)*this.canvas.width/r.width, y: (e.clientY-r.top)*this.canvas.height/r.height};
        },
        pointer_down(e) {
            if (!this.is_ready || this.gesture || (e.button !== 0 && e.button !== 1)) return;
            this.$refs.viewport.focus({preventScroll:true});
            const pan = this.tool === 'pan' || this.space_pan || e.button === 1;
            if (!pan && (this.is_disabled || !this.is_inpaint || this.compare_source)) return;
            const p = this.point(e);
            if (!pan && (p.x < 0 || p.y < 0 || p.x >= this.canvas.width || p.y >= this.canvas.height)) return;
            e.preventDefault(); this.$refs.viewport.setPointerCapture(e.pointerId);
            this.gesture = {id: e.pointerId, pan, x:e.clientX, y:e.clientY, start:p, rectangle:this.tool === 'rectangle'}; this.flag = true;
            if (!pan) { this.remember_mask(); this.prevX = p.x; this.prevY = p.y; if (!this.gesture.rectangle) this.paint(p); }
        },
        pointer_move(e) {
            const r = this.$refs.viewport.getBoundingClientRect();
            this.cursor_x = e.clientX-r.left; this.cursor_y = e.clientY-r.top; this.cursor_visible = true;
            const g = this.gesture;
            if (!g || g.id !== e.pointerId) return;
            if (!e.buttons) { this.pointer_up(e); return; }
            if (g.pan) { this.pan_x += e.clientX-g.x; this.pan_y += e.clientY-g.y; g.x=e.clientX; g.y=e.clientY; }
            else if (!this.is_disabled) {
                const p = this.point(e);
                if (g.rectangle) {
                    this.ctx.putImageData(this.mask_undo[this.mask_undo.length-1],0,0);
                    this.ctx.fillStyle=this.stroke_color;
                    this.ctx.fillRect(g.start.x,g.start.y,p.x-g.start.x,p.y-g.start.y);
                } else this.paint(p);
            }
        },
        pointer_up(e) {
            if (!this.gesture || this.gesture.id !== e.pointerId) return;
            const id = this.gesture.id; const painted = !this.gesture.pan;
            this.gesture = null; this.flag = false;
            if (this.$refs.viewport.hasPointerCapture(id)) this.$refs.viewport.releasePointerCapture(id);
            if (painted) this.mask_changed();
        },
        cancel_gesture() {
            if (this.gesture) this.pointer_up({pointerId:this.gesture.id});
            this.space_pan = false; this.cursor_visible = false; this.flag = false;
        },
        paint(p) {
            this.ctx.save();
            this.ctx.globalCompositeOperation = this.tool === 'eraser' ? 'destination-out' : 'source-over';
            this.ctx.fillStyle = this.ctx.strokeStyle = this.stroke_color;
            this.ctx.lineWidth = this.stroke_size*2; this.ctx.lineCap = 'round';
            this.ctx.beginPath(); this.ctx.moveTo(this.prevX,this.prevY); this.ctx.lineTo(p.x,p.y); this.ctx.stroke();
            this.ctx.beginPath(); this.ctx.arc(p.x,p.y,this.stroke_size,0,Math.PI*2); this.ctx.fill(); this.ctx.restore();
            this.prevX=p.x; this.prevY=p.y; this.is_something_drawn=true;
        },
        remember_mask() {
            this.mask_undo.push(this.ctx.getImageData(0,0,this.canvas.width,this.canvas.height));
            // Bound retained snapshots to ~64 MB, with at least one undo for large photos.
            const limit = Math.max(1,Math.min(20,Math.floor(64*1024*1024/(this.canvas.width*this.canvas.height*4))));
            if (this.mask_undo.length > limit) this.mask_undo.shift();
            this.mask_redo=[];
        },
        mask_changed() {
            this.is_something_drawn=this.ctx.getImageData(0,0,this.canvas.width,this.canvas.height).data.some((v,i)=>i%4===3 && v>0);
            this.$emit('mask-state',{undo:this.mask_undo.length,redo:this.mask_redo.length,drawn:this.is_something_drawn});
        },
        undo_mask() {
            if (this.is_disabled || !this.mask_undo.length) return;
            this.mask_redo.push(this.ctx.getImageData(0,0,this.canvas.width,this.canvas.height));
            this.ctx.putImageData(this.mask_undo.pop(),0,0); this.mask_changed();
        },
        redo_mask() {
            if (this.is_disabled || !this.mask_redo.length) return;
            this.mask_undo.push(this.ctx.getImageData(0,0,this.canvas.width,this.canvas.height));
            this.ctx.putImageData(this.mask_redo.pop(),0,0); this.mask_changed();
        },
        clear_inpaint(record = false) {
            if (record && this.is_disabled) return;
            if (record) this.remember_mask();
            this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height); this.is_something_drawn=false; this.flag=false;
            this.mask_changed();
        },
        invert_inpaint() {
            if (this.is_disabled || !this.is_ready) return;
            this.remember_mask(); this.ctx.save(); this.ctx.globalCompositeOperation='xor';
            this.ctx.fillStyle=this.stroke_color; this.ctx.fillRect(0,0,this.canvas.width,this.canvas.height); this.ctx.restore(); this.mask_changed();
        },
        on_img_change() {
            const id=this.image_load_id=(this.image_load_id||0)+1;
            this.is_ready=false; this.cancel_gesture(); this.clear_inpaint(); this.mask_undo=[]; this.mask_redo=[];
            this.image_loaded=loadImage(this.image_url(this.image_source)).then(img=>{
                if(id!==this.image_load_id)return;
                const sameSize=this.image_width===img.width && this.image_height===img.height;
                this.img_tag=img; this.image_width=img.width; this.image_height=img.height;
                this.canvasD.width=this.canvas.width=img.width; this.canvasD.height=this.canvas.height=img.height;
                this.canvasD.getContext('2d').drawImage(img,0,0); this.on_resize(); if(!sameSize)this.fit_view();
                this.is_ready=true; this.mask_changed(); if(this.on_img_load)this.on_img_load();
            }).catch(()=>{if(id===this.image_load_id){this.img_tag=undefined;this.$emit('image-error');}});
            return this.image_loaded;
        },
        get_size() {return {width:this.image_width,height:this.image_height};},
        get_img_b64() {return this.canvasD.toDataURL();},
        get_mask_for_cache() {return this.canvas.toDataURL();},
        get_mask_b64() {
            const canvas=document.createElement('canvas'); canvas.width=this.canvas.width; canvas.height=this.canvas.height;
            const ctx=canvas.getContext('2d'); ctx.fillStyle='black'; ctx.fillRect(0,0,canvas.width,canvas.height);
            ctx.filter='grayscale(1) brightness(10000)'; ctx.drawImage(this.canvas,0,0); return canvas.toDataURL();
        },
        get_img_mask_b64() {
            const canvas=document.createElement('canvas'); canvas.width=this.canvas.width; canvas.height=this.canvas.height;
            const ctx=canvas.getContext('2d'); ctx.drawImage(this.canvasD,0,0); ctx.drawImage(this.canvas,0,0); return canvas.toDataURL();
        },
        async restore_mask(source) {
            await this.$nextTick(); const id=this.image_load_id; await this.image_loaded;
            const img=await loadImage(source); if(id!==this.image_load_id || !this.is_ready)return;
            this.clear_inpaint(); this.ctx.drawImage(img,0,0); this.mask_changed();
        }
    },
    watch: {image_source() {this.on_img_change();}, is_inpaint(value) {if(!value)this.clear_inpaint();}, is_disabled(value) {if(value)this.cancel_gesture();}}
};
</script>
<style scoped>
.image-viewport {height:100%;width:100%;position:relative;overflow:hidden;touch-action:none;outline:none;background:var(--background-secondary);}
.image-viewport:focus-visible {outline:2px solid #4988db;outline-offset:-2px;}
.image-stack {position:absolute;top:0;left:0;transform-origin:0 0;pointer-events:none;}
.image-stack canvas,.comparison {position:absolute;inset:0;width:100%;height:100%;}
.brush-cursor {position:absolute;pointer-events:none;border:1px solid white;box-shadow:0 0 0 1px #222;border-radius:50%;transform:translate(-50%,-50%);}
</style>
