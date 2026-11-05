<template>
    <BasicSDApplet
        :app=app 
        :input_form=form_data
        :sd_options=sd_options
        :name="'img_post_process'"
        :form_tags="['img_post_process']"
        :required_assets=[]
        ref="basic_sd_applet"
    >   

    <template v-slot:input_buttons>
            <button :disabled="is_running || app.stable_diffusion?.is_input_avail === false" @click="upscale" class="l_button button_colored button_medium" style="float:right">{{is_running ? 'Upscaling…' : 'Upscale'}}</button>
    </template>

    <template v-slot:output_workpace>
        <GenerationGallery  :menu_items_skip="['use_params_current_page']" :app="app" :n_to_keep="2" ref="gallery"> </GenerationGallery>
    </template>


    </BasicSDApplet>
</template>
<script>

import BasicSDApplet from "../components/BasicSDApplet.vue"
import GenerationGallery from "../components/GenerationGallery.vue"
const PostProcessImage = {
    name: 'PostProcessImage',
    props: {app:Object, },
    components: {BasicSDApplet, GenerationGallery},
    mounted() {
        this.app.functions.send_to_postprocess = this.send_to_postprocess; 
    },
    data() {
        return {
            form_data:[
                {
                    "id" : "input_img",
                    "component" : "ImageInput",
                    "get_img_size" : true,
                }, 

                {
                    "id": "65453545",
                    "component": "InputWithDesc",
                    "title": "Upscaler",
                    "description": "",
                    "children": [
                        {
                            "id": "model",
                            "component": "Dropdown",
                            "options": ["Real-ESRGAN"],
                            "icon": "photo",
                            "default_value" : "Real-ESRGAN" , 
                            "is_persistant" : true
                        }
                    ]
                },
            ], 
            sd_options : {},
            is_running : false,

        };
    },
    methods: {

        send_to_postprocess(im_path ){
          this.sd_options["input_img"] = im_path;
          this.app.functions.switch_page("PostProcessImage")
       },

        async upscale(){
            if (this.is_running || this.app.stable_diffusion?.is_input_avail === false) return;
            const input = this.sd_options.input_img;
            const width = Number(this.sd_options.input_img__AUX__width);
            const height = Number(this.sd_options.input_img__AUX__height);
            if (!input) {this.app.show_toast('Please select an input image first');return;}
            if (this.sd_options.input_img__AUX__source !== input || !width || !height) {
                this.app.show_toast('Wait for the image to finish loading.');return;
            }
            if (width > 2048 || height > 2048) {
                this.app.show_toast('The upscaler accepts input images up to 2048 × 2048 pixels.');return;
            }
            this.is_running = true;
            const id = 'upscale:' + Date.now();
            try {
                const result = await window.ipcRenderer.invoke('run_realesrgan', input);
                const image = await new Promise((resolve, reject) => {
                    const img = new Image();img.onload = () => resolve(img);img.onerror = () => reject(new Error('The upscaled image could not be opened.'));
                    img.src = 'file://' + encodeURI(result).replace(/#/g,'%23').replace(/\?/g,'%3F');
                });
                const params = {applet_name:'upscale',input_img:input,img_width:image.naturalWidth,img_height:image.naturalHeight};
                const group = {group_id:id,num_imgs:1,img_width:image.naturalWidth,img_height:image.naturalHeight,
                    imgs:[{image_url:result,description:'Upscaled image',done_percentage:100,params}]};
                this.$refs.gallery.add_group(group);
                this.app.functions.add_to_history(id, group);
            } catch (error) {
                this.app.show_toast('Could not upscale the image. ' + error.message);
            } finally { this.is_running = false; }
        }

    },
}

export default PostProcessImage;
PostProcessImage.title = "Upscaler"
PostProcessImage.description = "Use AI to increase the resolution of an image."
PostProcessImage.icon = "expand-arrows-alt"
PostProcessImage.img_icon = require("../assets/imgs/page_icon_imgs/upscale.png")
PostProcessImage.home_category = "main"
PostProcessImage.sidebar_show = "always"

// add this to the always_on_pages to the PagesRouter

</script>
<style>
</style>
<style scoped>
</style>