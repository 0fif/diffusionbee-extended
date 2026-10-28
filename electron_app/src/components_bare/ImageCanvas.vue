<template>
    <div style="height:100% ; width:100%; position:  relative;">
        <canvas :id="canvas_d_id" style="width:100% ; height:100%; position: absolute ; top:0; left:0  " ></canvas>
        <canvas :id="canvas_id" style="width:100% ; height:100%; position: absolute ; top:0; left:0 ; opacity:0.7" ></canvas>
       
   </div>
</template>
<script>

function addImageProcess(src){
  return new Promise((resolve, reject) => {
    let img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

export default {
    name: 'ImageCanvas',
    props: {
        image_source : String,
        is_inpaint : Boolean,
        is_disabled : Boolean,
        canvas_d_id : String, 
        canvas_id: String,
        stroke_size_no : String,
        on_img_load: Function, 
    },
    components: {},
    computed: {
        stroke_size(){
            if(this.stroke_size_no)
                return Number( this.stroke_size_no)/5
            return 7;
        }
    },
    mounted() {
        this.ro = new ResizeObserver(this.on_resize);
        let canvas = document.getElementById(this.canvas_id);
        this.canvas = canvas;
        this.canvasD = document.getElementById(this.canvas_d_id);
        this.ctx = canvas.getContext("2d");
        this.ro.observe(canvas.parentElement);
        let that = this;

        if(this.image_source)
            this.on_img_change();

        canvas.addEventListener("mousemove", function (e) {
            that.findxy('move', e)
        }, false);
        canvas.addEventListener("mousedown", function (e) {
            that.findxy('down', e)
        }, false);
        canvas.addEventListener("mouseup", function (e) {
            that.findxy('up', e)
        }, false);
        canvas.addEventListener("mouseout", function (e) {
            that.findxy('out', e)
        }, false);

    },
    beforeDestroy(){
        this.ro.disconnect()
        this.image_load_id = (this.image_load_id || 0) + 1
    },
    data() {
        return {
            img_tag : undefined,
            is_ready: false,
            prevX : 0 , 
            prevY : 0 , 
            currX : 0 , 
            currY : 0 , 
            
            stroke_color : "#ff00ff" ,
            // x : "#ffffff" ,
            
            flag : false,
            is_something_drawn : false,
        };
    },
    methods: {

        on_img_load2(){
            if(this.on_img_load)
                 this.on_img_load()
        },

        findxy(res, e) {

            if (res == 'up' || res == 'out') {
                this.flag = false;
                return;
            }
            if (!this.is_inpaint || this.is_disabled || !this.is_ready)
                return;

            const rect = this.canvas.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const x = (e.clientX - rect.left) * this.canvas.width / rect.width;
            const y = (e.clientY - rect.top) * this.canvas.height / rect.height;
            if (res == 'down') {
                if (e.button !== 0) return;
                this.prevX = this.currX = x;
                this.prevY = this.currY = y;
                this.flag = true;
                this.draw();
            } else if (res == 'move' && this.flag) {
                if (e.buttons !== 1) {
                    this.flag = false;
                    return;
                }
                this.prevX = this.currX;
                this.prevY = this.currY;
                this.currX = x;
                this.currY = y;
                this.draw();
            }
        },

        draw() {
            const rect = this.canvas.getBoundingClientRect();
            const radius = this.stroke_size * Math.sqrt(
                this.canvas.width / rect.width * this.canvas.height / rect.height);
            this.ctx.fillStyle = this.stroke_color;
            this.ctx.strokeStyle = this.stroke_color;
            this.ctx.lineWidth = radius * 2;
            this.ctx.lineCap = 'round';
            this.ctx.beginPath();
            this.ctx.moveTo(this.prevX, this.prevY);
            this.ctx.lineTo(this.currX, this.currY);
            this.ctx.stroke();
            // A click with no movement must paint the same brush as a drag.
            this.ctx.beginPath();
            this.ctx.arc(this.currX, this.currY, radius, 0, 2 * Math.PI);
            this.ctx.fill();
            this.is_something_drawn = true;
        },

        get_size(){
            let img = this.img_tag
            return {width: img.width ,height: img.height }
        },

        on_resize(){
            let canvas = document.getElementById(this.canvas_id);
            let canvasD = document.getElementById(this.canvas_d_id);
            let img = this.img_tag;

            if(!img)
                return;
            
            let ph = canvas.parentElement.offsetHeight;
            let pw = canvas.parentElement.offsetWidth;

            let r = img.width / img.height;
            let r2 = img.height / img.width;
            if(ph*r <= pw ){
                canvas.style.height = ph +'px';
                canvas.style.width = ph*r +'px';

                canvasD.style.height = ph +'px';
                canvasD.style.width = ph*r +'px';

                canvas.style.marginLeft = (pw - ph*r )/2  + "px"
                canvasD.style.marginLeft = (pw - ph*r )/2  + "px"

                canvas.style.marginTop = 0 + "px"
                canvasD.style.marginTop = 0 + "px"

            }
            else{
                canvas.style.height = pw*r2 +'px';
                canvas.style.width = pw +'px';

                canvasD.style.height = pw*r2 +'px';
                canvasD.style.width = pw +'px';

                canvas.style.marginLeft =  0 + "px"
                canvasD.style.marginLeft =  0 + "px"

                canvas.style.marginTop = (ph - pw*r2 )/2 + "px"
                canvasD.style.marginTop = (ph - pw*r2 )/2 + "px"

            }
            
        },
        clear_inpaint(){
            let canvas = document.getElementById(this.canvas_id);
            let ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            this.is_something_drawn = false
            this.flag = false
        },
        invert_inpaint(){
            if (this.is_disabled || !this.is_ready) return;
            this.ctx.save();
            this.ctx.globalCompositeOperation = 'xor';
            this.ctx.fillStyle = this.stroke_color;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.restore();
            this.is_something_drawn = this.ctx.getImageData(0, 0,
                this.canvas.width, this.canvas.height).data.some((v, i) => i % 4 == 3 && v > 0);
        },
        on_img_change(){
            const load_id = this.image_load_id = (this.image_load_id || 0) + 1;
            this.is_ready = false;
            this.clear_inpaint();
            const source = this.image_source.startsWith('file://') ? this.image_source :
                'file://' + this.image_source.split('/').map(encodeURIComponent).join('/');
            this.image_loaded = addImageProcess(source).then(img => {
                if (load_id !== this.image_load_id) return;
                this.img_tag = img;
                this.on_resize();
                this.canvasD.height = this.canvas.height = img.height;
                this.canvasD.width = this.canvas.width = img.width;
                this.canvasD.getContext('2d').drawImage(img, 0, 0);
                this.is_ready = true;
                this.on_img_load2();
            }).catch(() => {
                if (load_id !== this.image_load_id) return;
                this.img_tag = undefined;
                this.canvasD.getContext('2d').clearRect(0, 0, this.canvasD.width, this.canvasD.height);
                this.$emit('image-error');
            });
            return this.image_loaded;
        },
        get_img_b64(){
            return this.canvasD.toDataURL();
        } , 
        get_mask_b64(){
            let canvas = document.createElement('canvas');
            canvas.width = this.canvas.width;
            canvas.height = this.canvas.height;
            let ctx =  canvas.getContext("2d");
            // let filt_w = canvas.width/50    
            ctx.filter = ' grayscale(1) brightness(10000) contrast(10000)'; // blur('+filt_w+'px)
            ctx.fillStyle = "black";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(this.canvas, 0, 0);
            return canvas.toDataURL();

        }, 
        get_img_mask_b64(){
            let canvas = document.createElement('canvas');
            canvas.width = this.canvasD.width;
            canvas.height = this.canvasD.height;
            let ctx =  canvas.getContext("2d");
            ctx.drawImage(this.canvasD, 0, 0);
            ctx.drawImage(this.canvas, 0, 0);
            
            return canvas.toDataURL();
        } , 

        get_mask_for_cache(){
            return this.canvas.toDataURL();
        },
       
       async restore_mask(mask_b64){
            // Wait for Vue's source watcher and the actual image, never a timer.
            await this.$nextTick();
            const load_id = this.image_load_id;
            await this.image_loaded;
            const image = await addImageProcess(mask_b64);
            if (load_id !== this.image_load_id || !this.is_ready) return;
            this.clear_inpaint();
            this.ctx.drawImage(image, 0, 0);
            this.is_something_drawn = true;
        }
    },

    watch: {
        'image_source': {

            handler: function() {
                this.on_img_change()
                // this.on_img_change()
            },
            deep: true
        } , 

        'is_inpaint': {
            handler: function(v) {
                if(!v){
                    this.clear_inpaint();
                }
            },
            deep: true
        } , 
    }
}
</script>
<style>
</style>
<style scoped>
</style>