<template>
    <div class="model-manager">
        <header class="model-header">
            <div><h1>Models</h1><p>Download image models or use your installed collection.</p></div>
            <button class="model-button" @click="import_model_locally" :disabled="is_local_model_importing">{{is_local_model_importing ? 'Importing…' : 'Import model'}}</button>
        </header>
        <div class="model-toolbar">
            <div class="model-tabs" role="group" aria-label="Model library">
                <button :aria-pressed="tab === 'installed'" @click="tab = 'installed'">Installed <span>{{installed_models.length}}</span></button>
                <button :aria-pressed="tab === 'discover'" @click="tab = 'discover'">Catalog</button>
            </div>
            <button class="model-button" @click="refresh" :disabled="refreshing">{{refreshing ? 'Refreshing…' : 'Refresh'}}</button>
        </div>
        <div class="model-filters">
            <input type="search" v-model="search" placeholder="Search image models" aria-label="Search image models">
            <select v-model="engine_filter" aria-label="Filter by engine"><option value="all">All engines ({{browse_models.length}})</option><option value="mflux">MFLUX ({{browse_models.filter(is_modern).length}})</option><option value="legacy">DiffusionBee ({{browse_models.filter(model => !is_modern(model)).length}})</option></select>
            <select v-model="task_filter" aria-label="Filter by task"><option value="all">All tasks</option><option value="txt2img">Text to image</option><option value="img2img">Image to image</option><option value="inpainting">Selected edits</option></select>
        </div>
        <p class="model-notice" v-if="!app.modern_backend.available">{{app.modern_backend.error || 'Checking the modern image engine…'}}</p>
        <p role="status" class="model-notice" v-if="catalog_error">{{catalog_error}}</p>
        <p role="status" class="model-notice" v-if="install_error">{{install_error}}</p>
        <p v-if="tab === 'discover'" class="catalog-scope">{{models_list.length}} models from DiffusionBee’s download catalog and {{(app.modern_backend.models || []).length}} MFLUX models integrated into Extended. Installed models are included. This is a download catalog, not a search of Hugging Face or Civitai.</p>
        <p class="model-summary">{{visible_models.length}} {{visible_models.length === 1 ? 'model' : 'models'}}</p>
        <div class="model-list">
            <article v-for="model in visible_models" :key="model.id" class="model-row">
                <div class="model-preview">
                    <img v-if="previews[model.id]?.status === 'ready'" :src="previews[model.id].image" :alt="previews[model.id].label" loading="lazy" @error="previews[model.id] = {status:'error', message:'Could not display this preview.'}">
                    <span v-else-if="!previews[model.id] || previews[model.id].status === 'loading'">Loading preview…</span>
                    <button v-else-if="previews[model.id].status === 'error'" class="preview-source" :title="previews[model.id].message" @click="load_preview(model, true)">Preview failed<br>Retry</button>
                    <span v-else :title="previews[model.id].message">{{previews[model.id].status === 'unknown' ? 'Source not linked' : 'No source preview'}}</span>
                </div>
                <div class="model-content">
                    <h2>{{model.title || model.id}}</h2>
                    <div class="model-meta">
                        <span>{{is_modern(model) ? 'MFLUX' : 'DiffusionBee'}}</span>
                        <span v-if="architecture(model)">{{architecture(model)}}</span>
                        <span v-if="tab === 'discover' && download_sizes[model.id]">{{format_size(download_sizes[model.id])}} download</span>
                        <span v-else-if="model.bytes || sizes[model.id]">{{format_size(model.bytes || sizes[model.id])}} on disk</span>
                        <span v-else-if="tab === 'discover' && !size_errors[model.id]">Checking size…</span>
                        <button v-else-if="tab === 'discover'" class="preview-source" :title="size_errors[model.id]" @click="load_size(model,true)">Retry size</button>
                    </div>
                    <p class="model-tools">{{task_checks(model, app.backend_info).filter(check => tasks(model).includes(check.task)).map(check => check.name).join(' · ') || 'Editing helper'}}</p>
                    <div class="model-stats" v-if="metadata[model.id]?.provider">
                        <button class="preview-source" @click="open_source(model)">{{metadata[model.id].provider}}</button>
                        <span v-if="metadata[model.id].downloads != null">{{metadata[model.id].downloads.toLocaleString()}} downloads {{metadata[model.id].provider === 'Hugging Face' ? '/ month' : 'across all versions'}}</span>
                        <span v-if="metadata[model.id].likes != null">{{metadata[model.id].likes.toLocaleString()}} {{metadata[model.id].likes_label === 'Thumbs up' ? 'thumbs up' : (metadata[model.id].likes === 1 ? 'like' : 'likes')}}</span>
                        <span v-if="metadata[model.id].updated">Updated {{new Date(metadata[model.id].updated).toLocaleDateString()}}</span>
                    </div>
                    <p v-else-if="metadata_loading[model.id]" role="status">Loading source details…</p>
                    <p v-else-if="metadata_errors[model.id]" role="status">Source details couldn’t load. <button class="preview-source" @click="load_metadata(model, {target:{open:true}}, true)">Retry</button></p>
                    <button v-if="previews[model.id]?.source" class="preview-source" @click="open_preview_source(model)">{{previews[model.id].label}} · View source</button>
                    <p v-if="description(model)">{{description(model)}}</p>
                    <p class="model-support" v-if="!model_available(model, app.backend_info) || !tasks(model).length">{{support_text(model)}}</p>

                    <details @toggle="load_metadata(model, $event)">
                        <summary>Details</summary>
                        <dl class="model-details">
                            <dt>Engine</dt><dd>{{is_modern(model) ? 'MFLUX' : 'DiffusionBee'}}</dd>
                            <dt>Available tools</dt><dd>{{task_checks(model, app.backend_info).filter(check => tasks(model).includes(check.task)).map(check => check.name).join(', ') || 'Editing helper'}}</dd>
                            <template v-if="model_metadata_to_str(model) !== 'Architecture not supplied'"><dt>Architecture</dt><dd>{{model_metadata_to_str(model)}}</dd></template>
                            <template v-else-if="metadata[model.id]?.architecture"><dt>Architecture</dt><dd>{{metadata[model.id].architecture}}</dd></template>
                            <template v-if="metadata[model.id]?.repo"><dt>Source</dt><dd>{{metadata[model.id].repo}} · {{metadata[model.id].provider}}</dd></template>
                            <template v-if="metadata[model.id]?.license"><dt>Source license</dt><dd>{{metadata[model.id].license}}</dd></template>
                            <template v-if="metadata[model.id]?.base_license"><dt>Base-model license</dt><dd>{{metadata[model.id].base_license}}</dd></template>
                            <template v-if="metadata[model.id]?.license_url"><dt>License</dt><dd><button class="preview-source" @click="open_source(model)">View publisher’s usage terms</button></dd></template>
                            <template v-if="sizes[model.id] || (model.status === 'done' && model.bytes)"><dt>Size on disk</dt><dd>{{format_size(sizes[model.id] || model.bytes)}}</dd></template>
                            <template v-if="download_sizes[model.id] || metadata[model.id]?.bytes"><dt>Download size</dt><dd>{{format_size(download_sizes[model.id] || metadata[model.id].bytes)}}</dd></template>
                            <template v-if="metadata[model.id]?.repository_bytes"><dt>Repository files</dt><dd>{{format_size(metadata[model.id].repository_bytes)}} total across all files</dd></template>
                            <template v-if="metadata[model.id]?.downloads != null"><dt>{{metadata[model.id].downloads_label || 'Downloads'}}</dt><dd>{{metadata[model.id].downloads.toLocaleString()}}</dd></template>
                            <template v-if="metadata[model.id]?.likes != null"><dt>{{metadata[model.id].likes_label || 'Likes'}}</dt><dd>{{metadata[model.id].likes.toLocaleString()}}</dd></template>
                            <template v-if="metadata[model.id]?.updated"><dt>Source updated</dt><dd>{{new Date(metadata[model.id].updated).toLocaleDateString()}}</dd></template>
                            <template v-if="metadata[model.id]?.creator"><dt>Creator</dt><dd>{{metadata[model.id].creator}}</dd></template>

                        </dl>
                        <p v-if="previews[model.id]?.label === 'Publisher family examples'">Publisher examples for the model family; not generated with these converted weights.</p>
                        <p>{{validation_note(model)}}</p>
                        <p v-if="metadata_loading[model.id]" role="status">Loading source statistics…</p>

                        <p v-if="metadata_errors[model.id]" role="status">{{metadata_errors[model.id]}} <button class="model-button" @click="load_metadata(model, {target:{open:true}}, true)">Retry</button></p>
                        <button v-if="source_url(model)" class="model-button" @click="open_source(model)">View source model card</button>
                    </details>
                </div>
                <div class="model-actions">
                    <span v-if="model.status === 'done' || model.is_locally_imported" class="installed-label">Installed</span>
                    <template v-if="is_modern(model)">
                        <template v-if="model.status === 'done'"><button class="model-button quiet" :disabled="app.stable_diffusion?.is_input_avail === false" @click="remove_model(model)">Remove</button></template>
                        <template v-else-if="installing === model.id"><span role="status">{{install_stage}}</span><progress v-if="install_progress.total_files" :value="install_progress.completed_files" :max="install_progress.total_files" aria-label="Files downloaded"/><span v-if="install_progress.total_files">{{install_progress.completed_files}} / {{install_progress.total_files}} files ready</span><span v-if="install_progress.transferred_bytes">{{format_size(install_progress.transferred_bytes)}} received</span><button class="model-button" :disabled="cancelling_install" @click="cancel_install">{{cancelling_install ? 'Cancelling…' : 'Cancel download'}}</button></template>
                        <button v-else class="model-button primary" :disabled="!!installing || !app.modern_backend.available" @click="install_model(model)">{{model.partial ? 'Resume download' : 'Download'}}</button>
                    </template>
                    <template v-else>
                        <DownloadButton v-if="model_available(model, app.backend_info)" :app="app" :asset_details="model"/>
                        <button v-else class="model-button" disabled>Unavailable</button>
                    </template>
                </div>
            </article>
        </div>
        <div class="model-empty" v-if="tab === 'installed' && !installed_models.length"><h2>No models installed</h2><p>Download an image model from the catalog to get started.</p><button class="model-button" @click="tab = 'discover'; search = ''; engine_filter = 'all'; task_filter = 'all'">Browse catalog</button></div>
        <div class="model-empty" v-else-if="!visible_models.length"><h2>No models match</h2><p>Try another search or change the filters.</p><button class="model-button" @click="search = ''; engine_filter = 'all'; task_filter = 'all'">Clear filters</button></div>

    </div>
</template>
<script>

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
        this.install_progress_listener = (event) => {if(event.id !== this.installing) return;if(event.message) this.install_stage = event.message;if(event.event === 'download') this.install_progress = event;};
        this.unsubscribe_install_progress = window.ipcRenderer.on('mflux-install-progress', this.install_progress_listener);
    },
    beforeUnmount(){if(this.unsubscribe_install_progress) this.unsubscribe_install_progress();},
    data() {
        return {
            is_local_model_importing : false,
            default_img_url : require("../assets/imgs/page_icon_imgs/default.png"),
            models_list : [],
            catalog_error: '', search:'', tab:'installed', engine_filter:'all', task_filter:'all',
            download_sizes:{}, size_errors:{}, size_loading:{}, refreshing:false, previews:{}, metadata:{}, metadata_loading:{}, metadata_errors:{}, sizes:{}, installing:null, install_stage:'', install_error:'', install_progress:{}, cancelling_install:false,
        };
    },
    watch: {visible_models(){this.load_previews();}},
    computed: {
        installed_models(){
            if (!this.app.is_mounted) return [];
            return Object.values(this.app.assets_manager.all_avail_assets).map(asset => ({...this.models_list.find(m => m.id === asset.id), ...asset}));
        },
        catalog_models(){
            const installed = new Map(this.installed_models.map(model => [model.id, model]));
            return [...new Map([...(this.app.modern_backend.models || []), ...this.models_list].map(model =>
                [model.id, {...model, ...(installed.get(model.id) || {})}])).values()];
        },
        browse_models(){return this.tab === 'installed' ? this.installed_models : this.catalog_models;},
        visible_models(){
            const models = this.browse_models;
            const query = this.search.toLowerCase().trim();
            return models.filter(m => (!query || [m.title,m.id,m.description,m.repo].join(' ').toLowerCase().includes(query)) &&
                (this.engine_filter === 'all' || (this.is_modern(m) ? 'mflux' : 'legacy') === this.engine_filter) &&
                (this.task_filter === 'all' || this.tasks(m).includes(this.task_filter)));
        }
    },
    methods: {
        model_available,
        is_modern(model){return model.model_meta_data?.engine === 'mflux';},
        tasks:model_tasks, task_checks, validation_note,
        architecture(model){
            const name = this.model_metadata_to_str(model);
            if (name === 'Architecture not supplied') return this.metadata[model.id]?.architecture || '';
            if (this.is_modern(model)) return model.model_meta_data?.float_type || '';
            return name;
        },
        description(model){
            const description = (model.description || '').trim();
            const normalize = value => value.toLowerCase().replace(/[^a-z0-9]/g, '');
            return normalize(description) === normalize(model.title || model.id) ? '' : description;
        },
        support_text(model){
            if (!this.is_modern(model) && this.app.backend_info?.legacy_error) return 'Legacy engine unavailable. Restart the app to try again.';
            if (!model_available(model,this.app.backend_info)) return this.is_modern(model) ? 'Requires an available MFLUX engine.' :
                `Requires a supported DiffusionBee backend (catalog minimum build ${model.min_version || 29}; active build ${this.app.backend_info?.build || 'unknown'}).`;
            if (this.is_modern(model)) return model.model_meta_data?.mask_mode === 'native'
                ? 'Uses your selection and instructions to edit the image.'
                : 'Instruction-based editing; selections are blended into the original.';
            if (model.model_meta_data?.type === 'controlnet_model') return 'Editing helper · Used with a generation model';
            return this.tasks(model).includes('inpainting') ? 'Legacy generation / masked editing · Quality varies by model' : 'Text to image';
        },
        open_preview_source(model){window.ipcRenderer.send('open_url',this.previews[model.id].source);},
        async load_preview(model, force = false){
            if (!force && this.previews[model.id]) return;
            this.previews[model.id] = {status:'loading'};
            try {this.previews[model.id] = await window.ipcRenderer.invoke('model-preview',{
                id:model.id,repo:model.repo,source_page_url:model.source_page_url,img_url:model.img_url
            },force);}
            catch(error){this.previews[model.id] = {status:'error',message:error.message};}
        },
        async load_size(model, force = false){
            if(this.size_loading[model.id] || (!force && (this.download_sizes[model.id] || this.size_errors[model.id]))) return;
            this.size_loading[model.id] = true;delete this.size_errors[model.id];
            try{this.download_sizes[model.id] = await window.ipcRenderer.invoke('model-download-size',{url:model.url,repo:model.repo,revision:model.revision,engine:model.model_meta_data?.engine},force);}
            catch(error){this.size_errors[model.id] = error.message;}
            finally{this.size_loading[model.id] = false;}
        },
        async load_previews(){
            const queue = this.visible_models.slice();
            await Promise.all([0,1,2].map(async()=>{while(queue.length){const model=queue.shift();await Promise.all([this.load_preview(model),this.load_metadata(model,{target:{open:true}}),...(this.tab === 'discover' ? [this.load_size(model)] : [])]);}}));
        },
        format_size(bytes){return Number.isFinite(bytes) ? (bytes / 1024**3).toFixed(2) + ' GiB' : 'Size unavailable';},
        source_url(model){const url=this.metadata[model.id]?.source || model.source_page_url;return url && /^https?:\/\//.test(url) ? url : null;},
        open_source(model){window.ipcRenderer.send('open_url',this.source_url(model));},
        async refresh(){
            this.refreshing=true;
            try {
                await Promise.all([this.load_models_list_from_web(),this.app.refresh_modern_models()]);
                for (const id of Object.keys(this.previews)) if (this.previews[id].status !== 'loading') delete this.previews[id];
                this.metadata={};this.metadata_errors={};
                this.load_previews();
                this.installing = this.app.modern_backend.installing;
                this.install_progress = this.app.modern_backend.install_progress || {};
                for (const model of this.installed_models) {
                    if (!model.bytes && model.asset_path) {
                        try {this.sizes[model.id] = await window.ipcRenderer.invoke('model-file-size',model.asset_path);} catch (_) { /* unknown size stays explicit */ }
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
            if (this.app.stable_diffusion?.is_input_avail === false) return;
            if (!native_confirm('Remove ' + model.title + ' from this computer? Generated images will be kept.')) return;
            try {await window.ipcRenderer.invoke('mflux-remove',model.id);await this.app.refresh_modern_models();}
            catch(error){this.install_error=error.message;}
        },
        cancel_install(){this.cancelling_install=true;this.install_stage='Cancelling…';window.ipcRenderer.invoke('mflux-cancel-install').catch(error=>{this.install_error=error.message;this.cancelling_install=false;});},
        async load_metadata(model,event,force = false){
            if (!event.target.open || this.metadata_loading[model.id] || (!force && this.metadata[model.id])) return;
            this.metadata[model.id] = {};this.metadata_loading[model.id] = true;delete this.metadata_errors[model.id];
            try {this.metadata[model.id] = await window.ipcRenderer.invoke('model-metadata',{id:model.id,repo:model.repo,source_page_url:model.source_page_url,url:model.url},force);}
            catch(error){delete this.metadata[model.id];this.metadata_errors[model.id] = 'Could not retrieve model information. ' + error.message;}
            finally {this.metadata_loading[model.id] = false;}
        },
        load_models_list_from_web(){
            let that = this;

            this.catalog_error = '';
            let models_url = "https://models.diffusionbee.com/list_models";
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);

            return fetch(models_url, {cache: "no-store", signal:controller.signal})
                .then(response => { if (!response.ok) throw new Error('catalog unavailable'); return response.json(); })
                .then(data => { if (!Array.isArray(data)) throw new Error('invalid catalog'); that.models_list = data; })
                .then(() => console.log(that.models_list))
                .then(() => that.save_models_list_local_storage())
                .catch(() => { that.catalog_error = 'Could not refresh models. Check your connection and try Refresh.'; })
                .finally(() => clearTimeout(timeout))


        } ,

        load_models_list_local_storage(){
            let models = window.localStorage.getItem("models_store")
            if(models){
                try { models = JSON.parse(models) } catch (_) { models = [] }
            }
            this['models_list'] = Array.isArray(models) ? models : []
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
ModelStore.description = "Download, import and manage models"
ModelStore.img_icon = require("../assets/imgs/page_icon_imgs/models.png")
ModelStore.home_category = "pages"
ModelStore.sidebar_show = "always"
// add this to the always_on_pages to the PagesRouter

</script>
<style scoped>
.model-manager{height:100%;overflow:auto;padding:24px;color:var(--text-color-solid);background:var(--color-bg)}
.model-header,.model-toolbar,.model-filters{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.model-header{justify-content:space-between;margin-bottom:24px}.model-header h1{font-size:24px;margin:0 0 6px}.model-header p,.model-summary{font-size:12px;opacity:.8;margin:0}
.model-toolbar{justify-content:space-between;border-bottom:1px solid var(--border-color-invert);margin-bottom:16px;padding-bottom:0}
.model-tabs{display:flex;gap:6px}.model-tabs button,.model-button{border:1px solid var(--border-color-invert);background:var(--color-bg);color:var(--text-color-solid);border-radius:5px;padding:7px 12px;font:inherit;font-size:12px;cursor:pointer}
.model-tabs button{border:0;border-radius:0;background:transparent;padding:12px 4px;border-bottom:2px solid transparent}.model-tabs{gap:24px}.model-tabs button[aria-pressed="true"]{border-bottom-color:#6ba9ff;color:var(--text-color-solid);font-weight:600}.model-button.primary{background:#2763b0;color:white;border-color:#2763b0}.model-button.quiet{border-color:transparent;background:transparent}.model-tabs span{margin-left:6px;font-variant-numeric:tabular-nums}
button:disabled{opacity:.5;cursor:default}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid #4988db;outline-offset:2px}button:hover:not(:disabled){filter:brightness(1.15)}
.model-filters{margin-bottom:12px}.model-filters input[type="search"]{flex:1;min-width:180px}.model-filters input[type="search"],.model-filters select{padding:8px;border:1px solid var(--border-color-invert);border-radius:5px;background:var(--color-bg);color:var(--text-color-solid);font-size:12px}.model-filters label{display:flex;gap:6px;align-items:center;margin:0;font-size:12px}
.catalog-scope{font-size:12px;line-height:1.5;margin:0 0 12px;max-width:85ch}.model-stats{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 12px;font-size:12px;margin:8px 0}.model-stats .preview-source{margin:0}.model-tools{line-height:1.5}.installed-label{font-size:12px;text-align:center}.model-summary{margin-bottom:16px}.model-row{display:grid;grid-template-columns:96px minmax(0,1fr) 130px;gap:16px;padding:20px 0;border-top:1px solid var(--border-color-invert)}
.model-preview{width:96px;height:96px;display:flex;align-items:center;justify-content:center;background:var(--sidebar-color);border-radius:5px;overflow:hidden;font-size:12px}.model-preview img{width:100%;height:100%;object-fit:cover}.model-preview img{object-fit:contain}.preview-source{display:block;border:0;background:transparent;color:inherit;font:inherit;font-size:11px;padding:0;margin:6px 0;text-align:left;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.model-actions progress{width:100%;height:8px}.model-preview span{padding:8px;text-align:center}
.model-content h2{font-size:16px;margin:0 0 6px;overflow-wrap:anywhere}.model-content p{font-size:12px;margin:8px 0;max-width:68ch}.model-meta{display:flex;gap:12px;flex-wrap:wrap;font-size:11px;opacity:.85;font-variant-numeric:tabular-nums}.model-support{font-weight:500}.model-actions{display:flex;flex-direction:column;gap:8px;align-items:stretch;font-size:12px}
summary{font-size:12px;cursor:pointer;margin-top:10px;padding:4px 0}.model-details{display:grid;grid-template-columns:130px 1fr;gap:6px;font-size:12px;margin:12px 0}.model-details dt{font-weight:500}.model-details dd{margin:0;overflow-wrap:anywhere}.model-notice{padding:10px;background:var(--sidebar-color);font-size:12px}.model-empty{padding:48px 0;text-align:center}.model-empty h2{font-size:18px}
@media(max-width:850px){.model-manager{padding:16px}.model-row{grid-template-columns:74px minmax(0,1fr);gap:12px}.model-preview{width:74px;height:74px}.model-actions{grid-column:2;flex-direction:row;flex-wrap:wrap}.model-details{grid-template-columns:100px 1fr}}
</style>
