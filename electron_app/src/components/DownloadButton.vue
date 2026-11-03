<template>
    <div>
        <div v-if="is_downloaded" >
             <!-- <p>Downloaded </p> -->
             <button @click="deletee" class="download-action secondary">Remove</button>

        </div>

        <div v-else-if="is_downloading" class="l_button">
             <b-progress :value="app.assets_manager.downloading[asset_details.id].progress" style="height: 8px; width:100%"></b-progress>
             {{app.assets_manager.downloading[asset_details.id].progress || 0  }}%
        </div>

        <div v-else-if="is_error"  >
            <p style="color:red; margin-bottom:5px">  Error : {{app.assets_manager.downloading[asset_details.id].error}} </p>
            <button @click="downloadd" class="download-action">Retry download</button>
        </div>


        <button v-else class="download-action" @click="downloadd">Download</button>
        
    </div>
</template>
<script>
import {native_confirm} from '../native_functions_vue_bridge.js'
export default {
    name: 'Downloadutton',
    props: { app:Object , asset_details:Object },
    components: {},
    mounted() {

    },
    data() {
        return {};
    },
    methods: {
        downloadd(){
            this.app.assets_manager.download_asset(this.asset_details)
        }, 
        deletee(){
            const name = this.asset_details.title || this.asset_details.id;
            if (!native_confirm('Remove ' + name + ' from this computer? Generated images will be kept.')) return;
            this.app.assets_manager.delete_asset(this.asset_details.id)
        }
    },

    computed: {
        is_downloaded(){
            let asset_id = this.asset_details.id

            if(this.asset_details.is_locally_imported)
                return true;

            if(this.app.is_mounted && this.app.assets_manager.downloaded_assets[asset_id] && this.app.assets_manager.downloaded_assets[asset_id].status == 'done'){
                return true
            } else {
                return false
            }
        } , 
        is_downloading(){
            let asset_id = this.asset_details.id
            return (this.app.is_mounted && this.app.assets_manager.downloading[asset_id]&& this.app.assets_manager.downloading[asset_id].status == 'downloading')
        } , 
        is_error(){
            let asset_id = this.asset_details.id
            return (this.app.is_mounted && this.app.assets_manager.downloading[asset_id]&& this.app.assets_manager.downloading[asset_id].status == 'error')
        }
    }
}
</script>
<style>
</style>
<style scoped>
.download-action{width:100%;border:1px solid #2763b0;border-radius:5px;padding:7px 12px;background:#2763b0;color:white;font:inherit;font-size:12px;cursor:pointer}
.download-action.secondary{background:transparent;color:var(--text-color-solid);border-color:transparent}
.download-action:hover{filter:brightness(1.15)}
.download-action:focus-visible{outline:2px solid #4988db;outline-offset:2px}
</style>
