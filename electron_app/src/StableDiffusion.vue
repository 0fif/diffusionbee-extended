<template>
    <div></div>
</template>
<script>

import { send_to_py } from "./py_vue_bridge.js"
import {get_tokens} from './clip_tokeniser/clip_encoder.js'

let notification_sound = new Audio(require('@/assets/notification.mp3'))

function remove_non_ascii(str) {
  
  if ((str===null) || (str===''))
       return false;
 else
   str = str.toString();
  
  return str.replace(/[^\x20-\x7E]/g, '');
}

export default {
    name: 'StableDiffusion',
    props: {},
    components: {},
    beforeDestroy() { clearInterval(this.generation_loop); },
    data() {
        return {
            is_stopping: false,
            is_backend_loaded : false,
            is_model_downloading: false, 
            is_input_avail : false,
            model_loading_msg : "",
            model_loading_title : "",
            loading_percentage : -1 , 
            generation_state_msg : "",
            remaining_times: "",
            attached_cbs : undefined,
            model_version : "",
            nb_its: 0,
            active_engine: '',
            generation_loop: undefined,
            started_at: 0,
            elapsed_seconds: 0,
            step: 0,
            steps: 0,
            step_seconds: null,
            run_outcome: "",
            diagnostics: null,
            pending_result: null
        };
    },
    methods: {
        async state_msg(msg){
            let msg_code = msg.substring(0, 4);
            if(msg_code == "mdld"){
                this.is_backend_loaded = true;
            }
            if(msg_code == "mldn"){
                this.is_model_downloading = false;
            }
            if(msg_code == "inrd"){
                if (this.pending_result) await this.pending_result;
                if (this.started_at) {
                    this.elapsed_seconds = (Date.now() - this.started_at) / 1000;
                    this.generation_state_msg = this.is_stopping ? 'Stopped' : (this.run_outcome || 'Finished');
                }
                clearInterval(this.generation_loop);
                this.attached_cbs = undefined;
                this.remaining_times = '';
                this.is_stopping = false
                this.is_input_avail = true; // note : is_input_avail can be watched so set this at last pls
            }
            if(msg_code == "inwk"){
                this.is_input_avail = false;
            }

            if(msg_code == "nwim" && !this.is_stopping){
                if (this.$parent.app_state.app_data.settings.notification_sound == true) {
                    notification_sound.play();
                }
                let img = msg.substring(5).trim()
                img = JSON.parse(img)
                if(this.attached_cbs){
                    this.diagnostics = img.timings ? {timings:img.timings, peak_memory_bytes:img.peak_memory_bytes, process_peak_bytes:img.process_peak_bytes, system_memory_delta:img.system_memory_delta} : null;
                    this.generation_state_msg = 'Finishing image';
                    const finishing = Date.now();
                    this.pending_result = Promise.resolve().then(() => this.attached_cbs && this.attached_cbs.on_img && this.attached_cbs.on_img(img))
                        .then(() => {this.run_outcome = 'Complete';})
                        .catch(error => {this.run_outcome = 'Failed';if (this.attached_cbs && this.attached_cbs.on_err) this.attached_cbs.on_err(error.message);})
                        .finally(() => {
                            if (this.diagnostics) this.$set(this.diagnostics.timings, 'finishing', (Date.now()-finishing)/1000);
                            this.pending_result = null;
                        });
                } else {
                    console.log("got new img but cbs none")
                }
            }

            if(msg_code == "mdvr"){
                this.model_version = msg.substring(5).trim()
            }

            if(msg_code == "mlpr"){
                let p = Number(msg.substring(5).trim());
                this.loading_percentage = p;
            }
            if(msg_code == "mlms"){
                let p = (msg.substring(5).trim());
                this.model_loading_msg = p;
            }
            if (msg_code === 'stat' && !this.is_stopping) {
                const event = JSON.parse(msg.substring(5));
                if (event.event === 'stage') this.generation_state_msg = event.message;
                if (event.event === 'progress') {
                    this.step = event.step || 0;
                    this.steps = event.steps || this.nb_its;
                    this.step_seconds = event.step_seconds;
                }
            }
            if(msg_code == "gnms" && !this.is_stopping){
                let p = (msg.substring(5).trim());
                this.generation_state_msg = p;
            }

            if(msg_code == "mltl"){
                let p = (msg.substring(5).trim());

                if( p.includes("Downloading") ){
                    this.is_model_downloading = true;
                }

                this.model_loading_title = p;
            }


            if(msg_code == "errr"){
                this.is_model_downloading = false;
                this.run_outcome = 'Failed';
                this.generation_state_msg = 'Failed';
                let error = msg.substring(5).trim()
                if(this.attached_cbs){
                    if(this.attached_cbs.on_err)
                        this.attached_cbs.on_err(error);
                }

            }

            if(msg_code == "dnpr" && !this.is_stopping){
                this.is_model_downloading = false;
                const p = Number(msg.substring(5).trim());
                if (!Number.isFinite(p)) return;
                if (this.active_engine !== 'mflux' && p >= 0) {
                    this.generation_state_msg = p >= 100 ? 'Finishing image' : 'Generating image';
                    this.step = Math.round(p * this.nb_its / 100);
                    this.steps = this.nb_its;
                }
                if (this.attached_cbs && this.attached_cbs.on_progress) this.attached_cbs.on_progress(p);
            }


        } ,

        begin_run(engine, steps) {
            clearInterval(this.generation_loop);
            this.active_engine = engine;
            this.is_input_avail = false;
            this.started_at = Date.now();
            this.elapsed_seconds = 0;
            this.step = 0; this.steps = steps; this.nb_its = steps;
            this.step_seconds = null; this.diagnostics = null; this.run_outcome = '';
            this.generation_state_msg = 'Starting';
            this.remaining_times = '';
            this.generation_loop = setInterval(() => {this.elapsed_seconds = (Date.now()-this.started_at)/1000;}, 1000);
        },
        interupt(){
            if (this.is_input_avail || this.is_stopping) return;
            this.is_stopping = true;
            this.generation_state_msg = 'Stopping…';
            this.remaining_times = '';
            this.attached_cbs = undefined;
            send_to_py("t2im __stop__");
        },

        is_ready(){
            if(this.is_model_downloading)
                return false 
            return this.is_backend_loaded
        },

        run_applet(applet_name , params , callbacks ){


            if(!this.is_input_avail)
                return;
            
            this.is_stopping = false

            this.generated_by = applet_name;
            this.attached_cbs = callbacks;

            this.begin_run('legacy', 0);
            this.generation_state_msg = "Running " + applet_name

            send_to_py("rapp " + applet_name + " " + JSON.stringify(params)) 
            
        },

        text_to_img(prompt_params, callbacks, generated_by){
            if(!this.is_input_avail)
                return;
            this.is_stopping = false
            let tokens = [49406].concat((get_tokens(prompt_params.prompt))).concat([49407])
            tokens.filter(n => n != null && n != undefined)
            prompt_params.prompt_tokens = tokens;

            if(prompt_params.negative_prompt)
            {
                let tokens2 = [49406].concat((get_tokens(prompt_params.negative_prompt))).concat([49407])
                tokens2.filter(n => n != null && n != undefined)
                prompt_params.negative_prompt_tokens = tokens2
            }

            prompt_params.seed = Number(prompt_params.seed) || 0 

            if(prompt_params.prompt && prompt_params.engine !== 'mflux'){
                prompt_params.prompt = remove_non_ascii(prompt_params.prompt)
            }

            if(prompt_params.negative_prompt){
                prompt_params.negative_prompt = remove_non_ascii(prompt_params.negative_prompt)
            }                

            this.generated_by = generated_by;
            this.attached_cbs = callbacks;
            this.begin_run(prompt_params.engine || 'legacy', Number(prompt_params.num_steps || prompt_params.ddim_steps || 25));
            send_to_py("t2im " + JSON.stringify(prompt_params)) 
        }

    },
}
</script>
<style>
</style>
<style scoped>
</style>
