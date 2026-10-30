<template>
    <div class="model-manager">
        <header class="model-header">
            <div><h1>Models</h1><p>Find image models, see what they support, and manage your downloads.</p></div>
            <button class="model-button" @click="import_model_locally" :disabled="is_local_model_importing">{{is_local_model_importing ? 'Importing…' : 'Import model'}}</button>
        </header>
        <div class="model-toolbar">
            <div class="model-tabs" role="group" aria-label="Model library">
                <button :aria-pressed="tab === 'installed'" @click="tab = 'installed'">Installed <span>{{installed_models.length}}</span></button>
                <button :aria-pressed="tab === 'discover'" @click="tab = 'discover'">Discover</button>
            </div>
            <button class="model-button" @click="refresh" :disabled="refreshing">{{refreshing ? 'Refreshing…' : 'Refresh'}}</button>
        </div>
        <div class="model-filters">
            <input type="search" v-model="search" placeholder="Search image models" aria-label="Search image models">
            <select v-model="engine_filter" aria-label="Filter by engine"><option value="all">All engines</option><option value="mflux">MFLUX</option><option value="legacy">DiffusionBee</option></select>
            <select v-model="task_filter" aria-label="Filter by task"><option value="all">All tasks</option><option value="txt2img">Text to image</option><option value="img2img">Image to image</option><option value="inpainting">Selected edits</option></select>
            <label v-if="tab === 'discover'"><input type="checkbox" v-model="compatible_only"> Compatible only</label>
        </div>
        <p class="model-notice" v-if="!app.modern_backend.available">{{app.modern_backend.error || 'Checking the modern image engine…'}}</p>
        <p role="status" class="model-notice" v-if="catalog_error">{{catalog_error}}</p>
        <p role="status" class="model-notice" v-if="install_error">{{install_error}}</p>
        <p class="model-summary">{{visible_models.length}} {{tab === 'installed' ? 'installed' : 'available'}} models · Compatibility describes engine support, not your computer’s speed.</p>
        <div class="model-list">
            <article v-for="model in visible_models" :key="model.id" class="model-row">
                <div class="model-preview">
                    <img v-if="thumbnail(model) && !failed_images[model.id]" :src="thumbnail(model)" :alt="is_modern(model) ? 'Example generated in Extended with ' + model.title : ''" loading="lazy" @error="$set(failed_images, model.id, true)">
                    <span v-else>{{failed_images[model.id] ? 'Preview unavailable' : 'No preview supplied'}}</span>
                </div>
                <div class="model-content">
                    <h2>{{model.title || model.id}}</h2>
                    <div class="model-meta"><span>{{is_modern(model) ? 'MFLUX' : 'DiffusionBee'}}</span><span>{{model_metadata_to_str(model) || 'Legacy checkpoint'}}</span><span v-if="model.bytes || sizes[model.id]">{{format_size(model.bytes || sizes[model.id])}} {{model.status === 'done' ? 'on disk' : ''}}</span></div>
                    <p>{{model.description || 'No description supplied by the publisher.'}}</p>
                    <p class="model-support">{{support_text(model)}}</p>
                    <ul class="task-checks" v-if="tasks(model).length"><li v-for="check in task_checks(model, app.backend_info)" :key="check.task">{{check.name}}: <strong>{{check.status}}</strong></li></ul>
                    <details @toggle="load_metadata(model, $event)">
                        <summary>Model details</summary>
                        <dl class="model-details">
                            <dt>Source</dt><dd>{{is_modern(model) ? model.repo : 'DiffusionBee catalog / local import'}}</dd>
                            <dt>License</dt><dd>{{model.license || 'See source model card'}}</dd>
                            <dt>Download size</dt><dd>{{format_size(model.bytes || metadata[model.id]?.bytes)}}</dd>
                            <dt>Downloads</dt><dd>{{metadata[model.id]?.downloads == null ? (metadata_loading[model.id] ? 'Loading…' : 'Not supplied') : metadata[model.id].downloads.toLocaleString() + ' · Hugging Face, last month'}}</dd>
                            <dt>Likes</dt><dd>{{metadata[model.id]?.likes == null ? (metadata_loading[model.id] ? 'Loading…' : 'Not supplied') : metadata[model.id].likes.toLocaleString()}}</dd>
                            <dt>Repository updated</dt><dd>{{metadata[model.id]?.updated ? new Date(metadata[model.id].updated).toLocaleDateString() : (metadata_loading[model.id] ? 'Loading…' : 'Not supplied')}}</dd>
                            <dt>Performance</dt><dd>No universal speed rating. Hardware and generation settings determine performance.</dd>
                        </dl>
                        <p>{{validation_note(model)}}</p>
                        <p v-if="metadata_loading[model.id]" role="status">Loading source statistics…</p>
                        <p v-if="!is_modern(model)">This source does not supply live download or popularity statistics.</p>
                        <p v-if="metadata_errors[model.id]" role="status">{{metadata_errors[model.id]}}</p>
                        <button v-if="source_url(model)" class="model-button" @click="open_source(model)">View source model card</button>
                    </details>
                </div>
                <div class="model-actions">
                    <template v-if="is_modern(model)">
                        <template v-if="model.status === 'done'"><span class="installed-label">Installed</span><button class="model-button primary" :disabled="!model_available(model, app.backend_info)" @click="use_model(model)">Use model</button><button class="model-button" @click="remove_model(model)">Remove</button></template>
                        <template v-else-if="installing === model.id"><span role="status">{{install_stage}}</span><progress v-if="install_progress.total_files" :value="install_progress.completed_files" :max="install_progress.total_files" aria-label="Files downloaded"/><span v-if="install_progress.total_files">{{install_progress.completed_files}} / {{install_progress.total_files}} files ready</span><span v-if="install_progress.transferred_bytes">{{format_size(install_progress.transferred_bytes)}} received</span><button class="model-button" :disabled="cancelling_install" @click="cancel_install">{{cancelling_install ? 'Cancelling…' : 'Cancel download'}}</button></template>
                        <button v-else class="model-button primary" :disabled="!!installing || !app.modern_backend.available" @click="install_model(model)">{{model.partial ? 'Resume download' : 'Download'}}</button>
                    </template>
                    <template v-else>
                        <DownloadButton v-if="model_available(model, app.backend_info)" :app="app" :asset_details="model"/>
                        <span v-else>Needs a supported backend</span>
                        <button v-if="(model.status === 'done' || model.is_locally_imported) && can_generate(model)" class="model-button" @click="use_model(model)">Use model</button>
                    </template>
                </div>
            </article>
        </div>
        <div class="model-empty" v-if="!visible_models.length"><h2>No models match</h2><p>Try another search or change the filters.</p><button class="model-button" @click="search = ''; engine_filter = 'all'; task_filter = 'all'; compatible_only = false">Clear filters</button></div>
        <footer>Tested means a recorded functional check; see Model details for scenarios and limitations. Refresh checks the catalog; it does not replace installed weights.</footer>
    </div>
</template>
<script>

import Vue from 'vue'
import {model_tasks, task_checks, validation_note, architecture_name} from '../utils/model_details.js'
import {native_confirm} from '../native_functions_vue_bridge.js'
import {model_available} from '../utils/model_compatibility.js'

import DownloadButton from "../components/DownloadButton.vue"


const ModelStore ={
    name: 'ModelStore',
    props: {app:Object, },
    components: {DownloadButton},
    mounted() {
        this.load_models_list_local_storage()
        this.refresh()
        this.install_progress_listener = (_, event) => {if(event.id !== this.installing) return;if(event.message) this.install_stage = event.message;if(event.event === 'download') this.install_progress = event;};
        window.ipcRenderer.on('mflux-install-progress', this.install_progress_listener);
    },
    beforeDestroy(){window.ipcRenderer.removeListener('mflux-install-progress', this.install_progress_listener);},
    data() {
        return {
            is_local_model_importing : false, 
            default_img_url : require("../assets/imgs/page_icon_imgs/default.png"),
            models_list : [], 
            catalog_error: '', search:'', tab:'installed', engine_filter:'all', task_filter:'all', compatible_only:true,
            refreshing:false, failed_images:{}, metadata:{}, metadata_loading:{}, metadata_errors:{}, sizes:{}, installing:null, install_stage:'', install_error:'', install_progress:{}, cancelling_install:false,
        };
    },
    computed: {
        installed_models(){
            if (!this.app.is_mounted) return [];
            return Object.values(this.app.assets_manager.all_avail_assets).map(asset => ({...this.models_list.find(m => m.id === asset.id), ...asset}));
        },
        visible_models(){
            const installed = new Set(this.installed_models.map(m => m.id));
            const models = this.tab === 'installed' ? this.installed_models :
                [...(this.app.modern_backend.models || []), ...this.models_list].filter(m => !installed.has(m.id));
            const query = this.search.toLowerCase().trim();
            return models.filter(m => (!query || [m.title,m.id,m.description,m.repo].join(' ').toLowerCase().includes(query)) &&
                (this.engine_filter === 'all' || (this.is_modern(m) ? 'mflux' : 'legacy') === this.engine_filter) &&
                (this.task_filter === 'all' || this.tasks(m).includes(this.task_filter)) &&
                (this.tab !== 'discover' || !this.compatible_only || model_available(m,this.app.backend_info)));
        }
    },
    methods: {
        model_available,
        is_modern(model){return model.model_meta_data?.engine === 'mflux';},
        tasks:model_tasks, task_checks, validation_note,
        can_generate(model){return this.tasks(model).includes('txt2img');},
        support_text(model){
            if (!model_available(model,this.app.backend_info)) return this.is_modern(model) ? 'Requires an available MFLUX engine.' :
                `Requires a supported DiffusionBee backend (catalog minimum build ${model.min_version || 29}; active build ${this.app.backend_info?.build || 'unknown'}).`;
            if (this.is_modern(model)) return 'Instruction-based editing; selections are blended into the original.';
            if (model.model_meta_data?.type === 'controlnet_model') return 'Editing helper · Used with a generation model';
            return this.tasks(model).includes('inpainting') ? 'Legacy generation / masked editing · Quality varies by model' : 'Text to image';
        },
        thumbnail(model){
            if (model.id === 'mflux-flux2-klein-4b-4bit') return require('../assets/model-previews/klein-4b.png');
            if (model.id === 'mflux-flux2-klein-9b-4bit') return require('../assets/model-previews/klein-9b.png');
            if (model.id === 'FLUX.1-schnell') return 'https://huggingface.co/black-forest-labs/FLUX.1-schnell/resolve/main/schnell_grid.jpeg';
            return model.img_url || this.models_list.find(m => m.id === model.id)?.img_url;
        },
        format_size(bytes){return Number.isFinite(bytes) ? (bytes / 1024**3).toFixed(2) + ' GiB' : 'Not supplied';},
        source_url(model){const url=model.source_page_url;return url && /^https?:\/\//.test(url) ? url : null;},
        open_source(model){window.ipcRenderer.send('open_url',this.source_url(model));},
        async refresh(){
            this.refreshing=true;
            try {
                await Promise.all([this.load_models_list_from_web(),this.app.refresh_modern_models()]);
                this.failed_images={};
                this.installing = this.app.modern_backend.installing;
                this.install_progress = this.app.modern_backend.install_progress || {};
                for (const model of this.installed_models) {
                    if (!model.bytes && model.asset_path) {
                        try {this.$set(this.sizes,model.id,await window.ipcRenderer.invoke('model-file-size',model.asset_path));} catch (_) { /* unknown size stays explicit */ }
                    }
                }
            } finally {this.refreshing=false;}
        },
        async install_model(model){
            this.installing=model.id;this.install_error='';this.install_progress={};this.cancelling_install=false;this.install_stage='Starting download…';
            try {await window.ipcRenderer.invoke('mflux-install',model.id);this.tab='installed';}
            catch(error){this.install_error=error.message.includes('Cancelled') ? 'Download cancelled. Download again to resume.' : error.message;}
            finally {this.installing=null;this.cancelling_install=false;await this.app.refresh_modern_models();}
        },
        async remove_model(model){
            if (!native_confirm('Remove ' + model.title + ' from this computer? Generated images will be kept.')) return;
            try {await window.ipcRenderer.invoke('mflux-remove',model.id);await this.app.refresh_modern_models();}
            catch(error){this.install_error=error.message;}
        },
        cancel_install(){this.cancelling_install=true;this.install_stage='Cancelling…';window.ipcRenderer.invoke('mflux-cancel-install').catch(error=>{this.install_error=error.message;this.cancelling_install=false;});},
        async load_metadata(model,event){
            if (!event.target.open || !this.is_modern(model) || this.metadata[model.id]) return;
            this.$set(this.metadata,model.id,{});this.$set(this.metadata_loading,model.id,true);this.$delete(this.metadata_errors,model.id);
            try {this.$set(this.metadata,model.id,await window.ipcRenderer.invoke('mflux-metadata',model.id));}
            catch(error){this.$delete(this.metadata,model.id);this.$set(this.metadata_errors,model.id,'Could not load source statistics. Close and reopen details to retry.');}
            finally {this.$set(this.metadata_loading,model.id,false);}
        },
        use_model(model){
            const page = 'Txt2Img';
            this.app.functions.switch_page(page);
            this.$nextTick(() => {
                const target = this.app.$refs.router.$refs[page][0].$refs.sd_applet;
                this.$set(target.sd_options, 'selected_sd_model', model.id);
            });
        },
        load_models_list_from_web(){
            let that = this;

            let user_id = window.ipcRenderer.sendSync('get_instance_id' , '');
            this.catalog_error = '';
            let models_url = "https://models.diffusionbee.com/list_models?user_id="+user_id;
            
            return fetch(models_url, {cache: "no-store"})
                .then(response => { if (!response.ok) throw new Error('catalog unavailable'); return response.json(); })
                .then(data => { if (!Array.isArray(data)) throw new Error('invalid catalog'); that.models_list = data; })
                .then(() => console.log(that.models_list))
                .then(() => that.save_models_list_local_storage())
                .catch(() => { that.catalog_error = 'Could not refresh models. Check your connection and try Refresh.'; })

            
        } ,     

        load_models_list_local_storage(){
            let models = window.localStorage.getItem("models_store")
            if(models){
                try { models = JSON.parse(models) } catch (_) { models = [] }
            }
            Vue.set(this , 'models_list' , Array.isArray(models) ? models : [])
        } , 

        save_models_list_local_storage(){
             window.localStorage.setItem('models_store' , JSON.stringify(this.models_list));
        } , 

        model_metadata_to_str:architecture_name,

        import_model_locally(){

            if(this.is_local_model_importing)
            {
                this.app.show_toast("Model is already importing. Please wait")
                return;
            }

            let that = this;
            //TODO maybe ask for stuff like v-prediction , ckip_slip, image_size, trigger word,  before importing
            let pytorch_model_path = window.ipcRenderer.sendSync('file_dialog',  "weights_file" );
            if(!pytorch_model_path)
                return;

            if(pytorch_model_path == "NULL")
                return;

            let model_name = pytorch_model_path.replaceAll("\\" , "/").split("/");
            model_name = model_name[model_name.length - 1].split(".")[0]


            if(model_name.trim() == ""){
                this.app.show_toast("Put non empty model name");
                return;
            }

            if(this.app.assets_manager.all_avail_assets[model_name]){
                this.app.show_toast("A model with this name already exists");
                return;
            }

            let asset_details = {
                id : model_name ,
                filename: model_name , 
                asset_path_raw: pytorch_model_path, 
                post_process : "convert_sd_to_tdict", 
                is_locally_imported : true, 
                model_meta_data : {"type" : "sd_model" }
            }

            this.is_local_model_importing = true;

            this.app.assets_manager.add_local_asset(asset_details , function(result, err ){
                if(result == "success" ){
                    that.is_local_model_importing = false;
                } else {
                    that.is_local_model_importing = false;
                    that.app.show_toast("Error while importing " + err )
                }

            })
        }
    },
}

export default ModelStore;
ModelStore.title = "Models"
ModelStore.icon = "cubes"
ModelStore.description = "Download, imoport and manage models"
ModelStore.img_icon = require("../assets/imgs/page_icon_imgs/models.png")
ModelStore.home_category = "pages"
ModelStore.sidebar_show = "always"
// add this to the always_on_pages to the PagesRouter

</script>
<style scoped>
.model-manager{height:100%;overflow:auto;padding:24px;color:var(--text-color-solid);background:var(--color-bg)}
.model-header,.model-toolbar,.model-filters{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.model-header{justify-content:space-between;margin-bottom:24px}.model-header h1{font-size:24px;margin:0 0 6px}.model-header p,.model-summary,footer{font-size:12px;opacity:.8;margin:0}
.model-toolbar{justify-content:space-between;border-bottom:1px solid var(--border-color-invert);margin-bottom:16px;padding-bottom:12px}
.model-tabs{display:flex;gap:6px}.model-tabs button,.model-button{border:1px solid var(--border-color-invert);background:var(--color-bg);color:var(--text-color-solid);border-radius:5px;padding:7px 12px;font:inherit;font-size:12px;cursor:pointer}
.model-tabs button[aria-pressed="true"],.primary{background:#2763b0;color:white;border-color:#2763b0}.model-tabs span{margin-left:6px;font-variant-numeric:tabular-nums}
button:disabled{opacity:.5;cursor:default}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid #4988db;outline-offset:2px}button:hover:not(:disabled){filter:brightness(1.15)}
.model-filters{margin-bottom:12px}.model-filters input[type="search"]{flex:1;min-width:180px}.model-filters input[type="search"],.model-filters select{padding:8px;border:1px solid var(--border-color-invert);border-radius:5px;background:var(--color-bg);color:var(--text-color-solid);font-size:12px}.model-filters label{display:flex;gap:6px;align-items:center;margin:0;font-size:12px}
.model-summary{margin-bottom:16px}.model-row{display:grid;grid-template-columns:110px minmax(0,1fr) 130px;gap:16px;padding:20px 0;border-top:1px solid var(--border-color-invert)}
.model-preview{width:110px;height:100px;display:flex;align-items:center;justify-content:center;background:var(--sidebar-color);border-radius:5px;overflow:hidden;font-size:12px}.model-preview img{width:100%;height:100%;object-fit:cover}
.task-checks{list-style:none;padding:0;margin:8px 0;display:flex;gap:6px 16px;flex-wrap:wrap;font-size:12px}.model-actions progress{width:100%;height:8px}.model-preview span{padding:8px;text-align:center}
.model-content h2{font-size:16px;margin:0 0 6px;overflow-wrap:anywhere}.model-content p{font-size:12px;margin:8px 0;max-width:68ch}.model-meta{display:flex;gap:12px;flex-wrap:wrap;font-size:11px;opacity:.85;font-variant-numeric:tabular-nums}.model-support{font-weight:500}.model-actions{display:flex;flex-direction:column;gap:8px;align-items:stretch;font-size:12px}.installed-label{color:var(--text-color-solid);text-align:center}
summary{font-size:12px;cursor:pointer;text-decoration:underline;text-underline-offset:3px}.model-details{display:grid;grid-template-columns:130px 1fr;gap:6px;font-size:12px;margin:12px 0}.model-details dt{font-weight:500}.model-details dd{margin:0;overflow-wrap:anywhere}.model-notice{padding:10px;background:var(--sidebar-color);font-size:12px}.model-empty{padding:48px 0;text-align:center}.model-empty h2{font-size:18px}footer{padding:24px 0}
@media(max-width:850px){.model-manager{padding:16px}.model-row{grid-template-columns:74px minmax(0,1fr);gap:12px}.model-preview{width:74px;height:74px}.model-actions{grid-column:2;flex-direction:row;flex-wrap:wrap}.model-details{grid-template-columns:100px 1fr}}
</style>
