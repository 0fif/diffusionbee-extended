<template>
    
    <div style=" width: 100%; height: 100%;">
        
        <!-- always open pages -->
        <div v-for="page_id in Object.keys(always_on_pages)"  :key="page_id" style="display:none" class="tpage"   :class="{ bl_display : current_open_page_id ===  page_id }">
             <component  :app="app" :is="page_id" :ref="page_id"></component>
        </div>

        <!-- applets -->
        <div v-for="applet_id in Object.keys(app.app_state.registered_ext_applets)"  :key="applet_id" style="display:none" class="tpage"   :class="{ bl_display : current_open_page_id ===  applet_id }">
             <AppletPage 
                :app="app" 
                :applet_id="applet_id" 
                :ref="applet_id" 
                :input_form="app.app_state.registered_ext_applets[applet_id].inputs" 
                :output_form="app.app_state.registered_ext_applets[applet_id].outputs" 
                :is_stop_avail="app.app_state.registered_ext_applets[applet_id].is_stop_avail"
            > </AppletPage>
        </div>


    </div>

</template>
<script>


import Txt2Img from "../pages/Txt2Img.vue"
import Img2Img from "../pages/Img2Img.vue"
import Inpainting from "../pages/Inpainting.vue"

import History from "../pages/History.vue"
import Homepage from "../pages/Homepage.vue"
import ModelStore from "../pages/ModelStore.vue"
import Logs from "../pages/Logs.vue"
import ContactUs from "../pages/ContactUs.vue"

import Settings from "../pages/Settings.vue"
import PostProcessImage from "../pages/PostProcessImage.vue"
import AppletPage from "../components/AppletPage.vue"

export default {
    name: 'PagerRouter',
    props: {
        app:Object, 
    },
    components: {
        Txt2Img, Img2Img , Inpainting , AppletPage , History, Homepage , ModelStore, 
        Logs, ContactUs , Settings, PostProcessImage
    },
    mounted() {
        this.app.functions.switch_page = this.switch_page; 
        this.app.all_pages_ready = true;
    },
    data() {

        let always_on_pages = { Homepage:Homepage  , Txt2Img:Txt2Img , Img2Img:Img2Img , 
            Inpainting:Inpainting , PostProcessImage:PostProcessImage  , ModelStore:ModelStore , History:History, Logs:Logs, Settings:Settings, ContactUs:ContactUs  }

        return {
            current_open_page_id : 'Homepage',
            always_on_pages : always_on_pages         };
    },
    methods: {
         switch_page(page_id){
            this.current_open_page_id = page_id;
            this.app.current_selected_tab = page_id
            this.app.current_applet_title = this.current_applet_title()


        }, 

        current_applet_title(){
            for( let el of this.all_applet_items){
                if( el.id == this.current_open_page_id ){
                    return el.text;
                }
            }
            return ""
        },
    },
    computed: {

        

        all_applet_items(){
            let items = []
            for(let page_id of Object.keys(this.always_on_pages) ){
                    items.push( { id: page_id , 
                        text : this.always_on_pages[page_id].title , 
                        description: this.always_on_pages[page_id].description, 
                        icon : this.always_on_pages[page_id].icon , 
                        img_icon:this.always_on_pages[page_id].img_icon , 
                        sidebar_show: this.always_on_pages[page_id].sidebar_show ,  
                        home_category:this.always_on_pages[page_id].home_category } )
            }

            for(let applet_id of Object.keys(this.app.app_state.registered_ext_applets)){
                let applet = this.app.app_state.registered_ext_applets[applet_id]
                items.push( { id: applet.id  , 
                    text : applet.title , 
                    icon : ({frame_interpolate: 'film', deforum: 'film', lora_training: 'microchip', lora_merger: 'tools'})[applet.id] || applet.icon || 'file' ,
                    description : applet.description , 
                    home_category: applet.home_category,
                    sidebar_show: applet.sidebar_show,
                    img_icon:( applet.img_icon ? require(("../assets/imgs/page_icon_imgs/").concat(applet.img_icon) ) : undefined )
                } )
            }

            return items
        },

        all_sidebar_items(){
            return this.all_applet_items.filter(item => item.sidebar_show !== 'never' &&
                (item.sidebar_show === 'always' || !!item.home_category));
        }
    }
}
</script>
<style>
</style>
<style scoped>

.tpage{
    width: 100%;
    height: 100%;
}

.bl_display{
    display:block !important;
}
</style>