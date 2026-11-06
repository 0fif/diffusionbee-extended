<template>
    <BasicSDApplet class="inpaint-applet" :class="{'settings-hidden': !show_settings}" :app="app" :input_form="input_form_elements_processed" :sd_options="sd_options"
        name="inpainting" :form_tags="form_tags_computed" :required_assets="required_assets"
        ref="basic_sd_applet" :model_options_types="model_options_types">
        <template v-slot:output_workpace>
            <section class="photo-editor">
                <div class="editor-toolbar" aria-label="Image controls">
                    <button class="editor-button" :disabled="!is_sd_active" @click="open_input_image">Open image</button>
                    <label v-if="inp_img" class="editor-model">Save as <select v-model="export_format" :disabled="!is_sd_active || is_exporting"><option value="jpg">JPEG (high quality)</option><option value="png">PNG (lossless)</option></select></label>
                    <button class="editor-button" :disabled="!inp_img || !is_sd_active || is_exporting" @click="save_img">{{is_exporting ? 'Saving…' : 'Save image'}}</button>
                    <label class="editor-model">Model <select v-model="sd_options.selected_sd_model" :disabled="!is_sd_active"><option v-if="!editor_models.some(model => model.id === sd_options.selected_sd_model)" :value="sd_options.selected_sd_model" disabled>Choose an available model</option><option v-for="model in editor_models" :key="model.id" :value="model.id">{{model.title || model.id}}</option></select></label>
                    <label v-if="model_resolution === 1024" class="editor-model" title="Auto sizes the working crop from your selection and surrounding context. Smaller sizes are faster but can lose detail. Your photo keeps its original size.">Edit resolution <select v-model.number="edit_resolution" :disabled="!is_sd_active"><option value="auto">Auto (selection size)</option><option v-if="minimum_edit_resolution <= 512" :value="512">512 px (faster)</option><option v-if="minimum_edit_resolution <= 768" :value="768">768 px</option><option :value="1024">1024 px</option></select></label>
                    <label v-if="supports_retouch" class="editor-model">Edit mode <select v-model="edit_mode" :disabled="!is_sd_active"><option value="retouch">Retouch</option><option value="replace">Replace</option></select></label>
                    <button class="editor-button" :aria-pressed="show_settings" @click="show_settings = !show_settings">Settings</button>
                    <span class="toolbar-spacer"></span>
                    <button class="editor-button" :disabled="!undo_history.length || !is_sd_active" @click="do_undo">Undo edit</button>
                    <button class="editor-button" :disabled="!redo_history.length || !is_sd_active" @click="do_redo">Redo edit</button>
                </div>
                <p v-if="!editor_models.some(model => model.id === sd_options.selected_sd_model)" class="model-selection-notice" role="status"><span>{{editor_models.length ? 'Choose an available model for this tool. You can download models in Models.' : 'No models available for this tool. Download a model in Models.'}}</span> <button type="button" class="model-selection-action" @click="app.functions.switch_page('ModelStore')">Open Models</button></p>
                <div v-if="inp_img" class="editor-toolbar" aria-label="Mask tools">
                    <div class="tool-group" aria-label="Tool">
                        <button v-for="item in tools" :key="item.id" class="editor-button" :aria-pressed="tool === item.id" :title="item.hint" @click="tool = item.id">{{item.label}}</button>
                    </div>
                    <label class="brush-control">Brush <input aria-label="Brush diameter in image pixels" type="range" min="1" max="300" v-model="stroke_size_no"><span>{{stroke_size_no}} px</span></label>
                    <button class="editor-button" :disabled="!mask_state.undo || !is_sd_active" @click="$refs.inp_img_canvas.undo_mask()" title="Undo mask stroke (⌘Z)">Undo mask</button>
                    <button class="editor-button" :disabled="!mask_state.redo || !is_sd_active" @click="$refs.inp_img_canvas.redo_mask()">Redo mask</button>
                    <button class="editor-button" :disabled="!is_sd_active" @click="$refs.inp_img_canvas.clear_inpaint(true)">Clear mask</button>
                    <button class="editor-button" :disabled="!is_sd_active" @click="$refs.inp_img_canvas.invert_inpaint()">Invert mask</button>
                    <label><input type="checkbox" v-model="show_mask"> Show mask</label>
                </div>
                <div class="editor-stage" @drop.prevent="onDragFile" @dragover.prevent>
                    <ImageCanvas v-if="inp_img" ref="inp_img_canvas" :is_inpaint="true" :image_source="inp_img"
                        :is_disabled="!is_sd_active || is_post_generate_box_showing" canvas_id="inpaintcan" canvas_d_id="inpaintcand"
                        :stroke_size_no="stroke_size_no" :tool="tool" :show_mask="show_mask"
                        :compare_source="show_before && retry_params ? retry_params.img_url : undefined"
                        @tool-change="tool = $event" @brush-change="stroke_size_no = String($event)"
                        @view-change="view = $event" @mask-state="mask_state = $event"
                        @image-error="app.show_toast('Could not open this image. Choose another file.')" />
                    <div v-else class="editor-empty">
                        <h2>Edit a photo</h2><p>Open an image, paint the area to change, and describe your edit.</p>
                        <button class="editor-button primary" :disabled="!is_sd_active" @click="open_input_image">Open image</button>
                        <p class="editor-hint">You can also drop a photo here.</p>
                    </div>
                </div>
                <div v-if="inp_img && !is_post_generate_box_showing" class="fill-bar">
                    <label for="fill-prompt">{{mask_state.drawn ? (instruction_edit ? 'Describe your edit' : 'Describe the replacement') : 'Select an area to edit'}}</label>
                    <div class="fill-input">
                        <textarea id="fill-prompt" v-model="sd_options.prompt" rows="2" :placeholder="instruction_edit ? 'Describe the change, for example: replace the blue shirt with a red shirt…' : 'Describe the finished area, for example: a red cotton shirt, natural lighting…'" :disabled="!is_sd_active" @keydown.meta.enter.prevent="generate(false)" @keydown.ctrl.enter.prevent="generate(false)"></textarea>
                        <button class="editor-button primary" :disabled="!is_sd_active || !mask_state.drawn || !sd_options.prompt.trim() || !editor_models.some(model => model.id === sd_options.selected_sd_model)" @click="generate(false)">{{retouch ? 'Generate edit' : 'Generate fill'}}</button>
                    </div>
                    <span class="editor-hint">{{retouch ? 'Retouch gives the model the original selected detail as a reference.' : instruction_edit ? 'This model edits from instructions. The app blends the selected area back into your photo.' : 'Describe what should appear in the selection. This model generates a replacement from your description.'}} Everything outside your mask stays unchanged.</span>
                </div>
                <div v-if="is_post_generate_box_showing" class="review-bar" aria-label="Review generated edit">
                    <strong>Review your edit</strong>
                    <button class="editor-button" :aria-pressed="show_before" @click="show_before = !show_before">{{show_before ? 'Showing before' : 'Compare before'}}</button>
                    <span class="toolbar-spacer"></span>
                    <button class="editor-button" :disabled="!is_sd_active" @click="discard_generation">Discard</button>
                    <button class="editor-button" :disabled="!is_sd_active" @click="retry_generatge">Try again</button>
                    <button class="editor-button primary" :disabled="!is_sd_active" @click="keep_generation">Keep edit</button>
                </div>
                <div class="editor-status" aria-live="polite">
                    <GenerationStatus v-if="is_mounted" :backend="stable_diffusion"/>
                    <button v-if="is_mounted && !stable_diffusion.is_input_avail && stable_diffusion.generated_by === 'Inpainting'" class="editor-button" :disabled="is_stopping || !!stable_diffusion.pending_result" @click="stop_all">{{is_stopping ? 'Stopping…' : 'Stop generation'}}</button>
                    <span v-if="!is_mounted || stable_diffusion.is_input_avail" class="editor-hint">Scroll to zoom · Space + drag to pan · B brush · E erase</span>
                    <span class="toolbar-spacer"></span>
                    <template v-if="inp_img">
                        <button class="editor-button" aria-label="Zoom out" @click="$refs.inp_img_canvas.zoom_to(view.zoom / 1.25)">−</button>
                        <span class="zoom-value">{{view.percent}}%</span>
                        <button class="editor-button" aria-label="Zoom in" @click="$refs.inp_img_canvas.zoom_to(view.zoom * 1.25)">+</button>
                        <button class="editor-button" @click="$refs.inp_img_canvas.fit_view()">Fit</button>
                        <button class="editor-button" @click="$refs.inp_img_canvas.actual_size()">100%</button>
                    </template>
                </div>
            </section>
        </template>
    </BasicSDApplet>
</template>

<script>
import {save_image_data} from "../native_functions_vue_bridge.js"
import {export_image, image_export_format} from '../utils/image_export.js'
import {tool_models} from '../utils/model_details.js'
import GenerationStatus from "../components/GenerationStatus.vue"

import {composite_inpaint, prepare_inpaint_crop} from '../utils/composite_inpaint.js'
import BasicSDApplet from "../components/BasicSDApplet.vue"
import ImageCanvas from '../components_bare/ImageCanvas.vue'

import {find_in_form_recursive} from "../utils.js"
import {inpaint_assets , prep_sd_optins} from "../utils/in_out_paint_utils.js"


const Inpainting = {
    name: 'Inpainting.vue',
    props: {
        app:Object, 
    },
    components: { GenerationStatus, BasicSDApplet , ImageCanvas  },
    mounted() {
        this.stable_diffusion = this.app.stable_diffusion
        this.app.functions.send_to_inpaint = this.send_to_inpaint; 
        this.is_mounted = true
    },
    data() {
        return {
            sd_options : {"num_imgs":"1", "prompt":"", "selected_sd_model":"", "inp_only_update_masked":true, "input_image_strength":80},
            backend_error : "",
            is_mounted: false,
            is_stopping : false,
            is_restoring: false,
            undo_history : [],
            redo_history : [],
            done_percentage: -1,
            retry_params: undefined,
            inp_img: "",
            is_post_generate_box_showing : false,
            stroke_size_no: "30",
            show_settings: false, tool: 'brush', show_mask: true, show_before: false,
            completed_edit: null,
            edit_resolution: 'auto',
            edit_mode: 'retouch',
            export_format: 'png', is_exporting: false,
            view: {zoom: 1, percent: 100}, mask_state: {undo: 0, redo: 0, drawn: false},
            tools: [{id: 'rectangle', label: 'Select', hint: 'Rectangular selection (M)'}, {id: 'brush', label: 'Brush', hint: 'Paint mask (B)'}, {id: 'eraser', label: 'Erase', hint: 'Erase mask (E)'}, {id: 'pan', label: 'Pan', hint: 'Move view (H or Space)'}],


        };
    },
    computed : {
        supports_retouch(){
            const meta = (this.app.assets_manager.all_avail_assets[this.sd_options.selected_sd_model] || {}).model_meta_data || {};
            return meta.engine === 'mflux' && meta.edit_mode === 'instruction' && meta.mask_mode === 'native' && (meta.tasks || []).includes('img2img');
        },
        retouch(){ return this.supports_retouch && this.edit_mode === 'retouch'; },
        model_resolution(){
            const meta = (this.app.assets_manager.all_avail_assets[this.sd_options.selected_sd_model] || {}).model_meta_data || {};
            return meta.engine === 'mflux' || meta.sd_type === 'sdxl_base' ? 1024 : 512;
        },
        minimum_edit_resolution(){
            return this.app.assets_manager.all_avail_assets[this.sd_options.selected_sd_model]?.model_meta_data?.min_edit_resolution || 512;
        },
        working_resolution(){
            if (this.model_resolution !== 1024) return this.model_resolution;
            return this.edit_resolution === 'auto' ? 'auto' : Math.max(this.minimum_edit_resolution, [512,768,1024].includes(this.edit_resolution) ? this.edit_resolution : 1024);
        },
        instruction_edit(){
            const meta = (this.app.assets_manager.all_avail_assets[this.sd_options.selected_sd_model] || {}).model_meta_data || {};
            return meta.edit_mode === 'instruction';
        },
        editor_models(){
            return tool_models(this.app.assets_manager.all_avail_assets, this.app.backend_info, 'inpainting');
        },

        is_sd_active(){
            if(!this.is_mounted)
                return false;
            return this.stable_diffusion.is_input_avail && !this.is_restoring;
        },

        required_assets(){
            return inpaint_assets(this , "Generative Fill");
        }, 

        form_tags_computed(){
            const metadata = (this.app.assets_manager.all_avail_assets[this.sd_options.selected_sd_model] || {}).model_meta_data || {};
            if (metadata.engine !== 'mflux' && (metadata.type === 'sd_model' || metadata.sd_type === 'sdxl_base' || this.sd_options.outpaint_function_name === "Image To Image")){
                return ['inpainting', 'input_image_strength']
            }

            return ['inpainting']
        },

        model_options_types(){
            return ["sd_model" ,"sd_model_inpaint", "mflux_model"]
            
        },

        input_form_elements_processed(){
            let form_or = require("../forms/sd_options_adv.json")
            form_or = JSON.parse(JSON.stringify(form_or))
            let el = find_in_form_recursive( "selected_sd_model" , form_or)

            el['options'] = [ "SD1.5_Inpainting" , "Default_SD1.5" ]
            const strength = find_in_form_recursive('input_image_strength', form_or);
            strength.default_value = 80;
            strength.is_persistant = false;
            form_or = form_or.filter(item => item.id !== 'prompt');

            return form_or
        }
    },
    watch: {
        minimum_edit_resolution(minimum){
            if (this.edit_resolution !== 'auto' && this.edit_resolution < minimum) this.edit_resolution = 'auto';
        }
    },
    methods: {
        record_completed_edit(){
            const edit = this.completed_edit;
            if (!edit) return;
            edit.params.export_format = this.export_format;
            return this.app.functions.add_to_history('inpaint:' + edit.image_url, {
                num_imgs: 1, img_width: edit.params.img_width, img_height: edit.params.img_height,
                imgs: [edit]
            });
        },
        keep_generation(){
            if (!this.is_sd_active || !this.is_post_generate_box_showing || !this.completed_edit) return;
            this.record_completed_edit();
            this.completed_edit = null;
            this.show_before = false;
            this.is_post_generate_box_showing = false;
        },
        generate(is_retry){
            try {

            if(!this.is_sd_active || (this.is_post_generate_box_showing && !is_retry))
                return;

            if (!this.inp_img || !this.$refs.inp_img_canvas || !this.$refs.inp_img_canvas.is_ready) {
                this.app.show_toast("Open an image and wait for it to load before generating.");
                return;
            }
            if (!is_retry && !this.$refs.inp_img_canvas.is_something_drawn) {
                this.app.show_toast("Draw a mask over the area you want to change.");
                return;
            }

            if(!this.$refs.basic_sd_applet.check_input_form_n_show_error()){
                return
            }

            this.show_before = false;
            this.is_stopping = false;
            this.backend_error = "";
            this.completed_edit = null;
            this.done_percentage = -1;

            this.is_post_generate_box_showing = false


            let sd_options_object = this.$refs.basic_sd_applet.get_sd_form_outputs()

            let img_url
            let img_mask_url
            let generation_input

            if(this.retry_params == undefined)
                this.retry_params = {}

            if(is_retry && this.retry_params.content && this.retry_params.minimum_resolution === this.minimum_edit_resolution && this.retry_params.resolution === this.working_resolution && this.retry_params.retouch === this.retouch){
                img_url = this.retry_params.img_url
                img_mask_url = this.retry_params.img_mask_url
                generation_input = this.retry_params.generation_input
                
            } else {
                let box_img_b64 = this.$refs.inp_img_canvas.get_img_b64();
                img_url = save_image_data(box_img_b64, true);


                const editor = this.$refs.inp_img_canvas;
                const prepared = prepare_inpaint_crop(editor.canvasD, editor.canvas, this.working_resolution, this.model_resolution, this.retouch, this.minimum_edit_resolution);
                generation_input = save_image_data(prepared.image, true);
                img_mask_url = save_image_data(prepared.mask, true);
                this.retry_params.crop = prepared.crop;
                this.retry_params.content = prepared.content;
                this.retry_params.width = prepared.width;
                this.retry_params.height = prepared.height;
                this.retry_params.resolution = this.working_resolution;
                this.retry_params.minimum_resolution = this.minimum_edit_resolution;
                this.retry_params.retouch = this.retouch;
                this.retry_params.generation_input = generation_input;
                this.retry_mask_cached = editor.get_mask_for_cache();
            }


            
            
            this.retry_params.img_url = img_url
            this.retry_params.img_mask_url = img_mask_url
            



            console.log(img_url)
            console.log(img_mask_url)

            sd_options_object.input_img = generation_input

            prep_sd_optins(this , sd_options_object , "Generative Fill" , img_mask_url)
            sd_options_object.img_width = this.retry_params.width;
            sd_options_object.img_height = this.retry_params.height;
            sd_options_object.force_use_given_size = true;

            let that = this;


            let callbacks = {
                async on_img(img_path){
                    that.is_restoring = true;
                    try {
                        const composite = await composite_inpaint(img_url, that.retry_mask_cached, img_path.generated_img_path,
                            that.retry_params.crop, !that.retry_params.retouch, that.retry_params.content);
                        const saved = save_image_data(composite);
                        if (!saved || saved === 'NULL') throw new Error('Could not save the edited image.');
                        const size = that.$refs.inp_img_canvas.get_size();
                        that.completed_edit = {image_url: saved, done_percentage: 100,
                            params: {...sd_options_object, img_width:size.width, img_height:size.height}};
                        that.record_completed_edit();
                        that.undo_history.push(img_url)
                    that.redo_history = []
                    that.$refs.inp_img_canvas.clear_inpaint()
                    that.inp_img = saved
                    that.is_post_generate_box_showing = true
                    } catch (err) {
                        that.backend_error = 'Could not prepare the edit. Your original image is unchanged.';
                        throw new Error(that.backend_error, {cause:err});
                    } finally { that.is_restoring = false; }
                },
                on_progress(p){
                    that.done_percentage = p;
                    
                },
                on_err(err){
                    that.app.show_toast("Error : " + err)
                    that.backend_error = err;
                },
            }
                
            this.stable_diffusion.text_to_img(sd_options_object, callbacks, 'Inpainting');
            } catch (error) { this.backend_error = error.message; this.app.show_toast(error.message); }
           
        }, 

        async retry_generatge(){
            if (!this.is_sd_active || !this.retry_params || !this.is_post_generate_box_showing) return;
            await this.discard_generation();
            this.sd_options['seed'] = Math.floor(Math.random()*2147483647);
            this.generate(true);
        },

        do_undo(){
            this.show_before = false;
            if (!this.is_sd_active) return;
            if(this.undo_history.length == 0)
                return;

            this.is_post_generate_box_showing = false
            let a = this.undo_history.pop()

            if(a){
                this.redo_history.push(this.inp_img)
                this.inp_img = a;
                if(this.$refs.inp_img_canvas){
                    this.$refs.inp_img_canvas.clear_inpaint()
                }
            }
                
        },

        do_redo(){
            this.show_before = false;
            if (!this.is_sd_active) return;
            if(this.redo_history.length == 0)
                return;
            this.is_post_generate_box_showing = false
            let a = this.redo_history.pop()
            if(a){
                this.undo_history.push(this.inp_img )
                this.inp_img = a;
                if(this.$refs.inp_img_canvas){
                    this.$refs.inp_img_canvas.clear_inpaint()
                }
               
            }
            
        },

        async discard_generation(){
            if (!this.is_sd_active || !this.retry_params || !this.is_post_generate_box_showing) return;
            this.show_before = false;
            this.is_restoring = true;
            this.completed_edit = null;
            this.inp_img = this.retry_params.img_url;
            this.undo_history.pop();
            this.is_post_generate_box_showing = false;
            try {
                await this.$nextTick();
                await this.$refs.inp_img_canvas.restore_mask(this.retry_mask_cached);
            } finally {
                this.is_restoring = false;
            }
        },

        onDragFile(e) {
            if (!this.stable_diffusion.is_input_avail)
                return;
            if (!e.dataTransfer.files[0] || !e.dataTransfer.files[0].type.startsWith('image/'))
                return;
            let img_path = window.getPathForFile(e.dataTransfer.files[0]);
            this.set_inp_image(img_path)
        },

        set_inp_image(img_path){
            if (!this.is_sd_active) return;
            this.completed_edit = null;
            this.show_before = false
            this.retry_params = undefined
            this.retry_mask_cached = undefined
            this.is_post_generate_box_showing = false
            this.inp_img = img_path;
            this.undo_history = []
            this.redo_history = []
            this.input_img_orig = img_path
            this.export_format = image_export_format(img_path);
            this.history_key = Math.random()+"inp"
            if(this.$refs.inp_img_canvas){
                this.$refs.inp_img_canvas.clear_inpaint()
            }
        },


        open_input_image(){
            if( !this.stable_diffusion.is_input_avail)
                return;
            let img_path = window.ipcRenderer.sendSync('file_dialog',  'img_file' );
            if(img_path && img_path != 'NULL'){
               this.set_inp_image(img_path)
            }
        },

        stop_all(){
            if (this.stable_diffusion.pending_result || this.stable_diffusion.is_input_avail) return;
            this.is_post_generate_box_showing = false
            this.is_stopping = true;
            this.stable_diffusion.interupt();
        }, 

        clear_canvas(){
            if (!this.is_sd_active) return;
            this.is_post_generate_box_showing = false
            if(this.$refs.inp_img_canvas){
                this.$refs.inp_img_canvas.clear_inpaint()
            }
            this.inp_img = ""
            this.undo_history = []
            this.redo_history = []
            this.prompt = ""
            this.input_img_orig = ""
            this.history_key = ""
            this.retry_params  = undefined
        },

        async save_img(){
            if (!this.is_sd_active || this.is_exporting || !this.$refs.inp_img_canvas.is_ready) return;
            this.is_exporting = true;
            try {
                const name = (this.input_img_orig || 'Image').split('/').pop().replace(/\.[^.]+$/, '') + '-edited.' + this.export_format;
                await export_image(this.$refs.inp_img_canvas.get_img_b64(), this.export_format, name);
            } catch (error) { this.app.show_toast(error.message); }
            finally { this.is_exporting = false; }
        },

       
        send_to_inpaint(im_path, format){
          this.set_inp_image(im_path)
          if (['jpg','png'].includes(format)) this.export_format = format;
          this.app.functions.switch_page("Inpainting")

       }
    },  
}

export default Inpainting;
Inpainting.title = "Inpainting"
Inpainting.description = "Add or remove objects from an image"
Inpainting.icon = "paint-brush"
Inpainting.img_icon = require("../assets/imgs/page_icon_imgs/inpainting.png")
Inpainting.home_category = "main"
Inpainting.sidebar_show = "always"

</script>
<style scoped>
.settings-hidden :deep(.left_controls) {display:none;}
.settings-hidden :deep(.right_workpace) {width:100%;}
.inpaint-applet :deep(.applet_container) {flex-wrap:nowrap;align-items:stretch;}
.editor-model select {max-width:180px;background:var(--color-bg);color:var(--text-color-solid);border:1px solid var(--border-color-invert);border-radius:6px;padding:6px;}

.fill-bar {padding:12px;display:flex;flex-direction:column;gap:7px;border-top:1px solid var(--border-color-invert);}
.fill-bar label {font-size:13px;font-weight:600;margin:0;}
.fill-input {display:flex;gap:8px;align-items:stretch;}
.fill-input textarea {flex:1;min-width:0;resize:vertical;max-height:120px;border:1px solid var(--border-color-invert);border-radius:6px;padding:9px;background:var(--color-bg);color:var(--text-color-solid);font:inherit;font-size:13px;}
.fill-input textarea:focus {outline:2px solid #4988db;outline-offset:1px;}

.photo-editor {height:100%;min-height:400px;display:flex;flex-direction:column;background:var(--color-bg);color:var(--text-color-solid);}
.editor-toolbar,.editor-status,.review-bar {display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;border-bottom:1px solid var(--border-color-invert);}
.editor-toolbar label {margin:0;font-size:12px;display:flex;align-items:center;gap:6px;}
.editor-button {appearance:none;border:1px solid var(--border-color-invert);border-radius:6px;background:var(--color-bg);color:var(--text-color-solid);padding:6px 10px;font:inherit;font-size:12px;line-height:18px;cursor:pointer;white-space:nowrap;}
.editor-button:hover:not(:disabled) {background:var(--button-highlight-one);}
.editor-button:focus-visible {outline:2px solid #4988db;outline-offset:2px;}
.editor-button:disabled {opacity:.4;cursor:default;}
.editor-button.primary,.editor-button[aria-pressed="true"] {background:#2763b0;border-color:#2763b0;color:white;}
.editor-button.primary:hover:not(:disabled),.editor-button[aria-pressed="true"]:hover {background:#1e4f8d;}
.generate {width:100%;font-size:14px;padding:9px;}
.tool-group {display:flex;gap:3px;}
.brush-control input {width:80px;accent-color:#2763b0;}
.brush-control span,.zoom-value {font-variant-numeric:tabular-nums;min-width:38px;}
.toolbar-spacer {flex:1;}
.editor-stage {flex:1;min-height:180px;overflow:hidden;}
.editor-empty {height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;padding:24px;}
.editor-empty h2 {font-size:22px;}
.editor-empty p {max-width:300px;}
.editor-hint {font-size:12px;color:var(--text-invert-color);}
.editor-status {border-top:1px solid var(--border-color-invert);border-bottom:0;font-size:12px;}
.review-bar {border-top:1px solid var(--border-color-invert);background:var(--options-input-bg);font-size:12px;}
</style>
