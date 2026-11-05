<template>
    <div style="width: 100%; height :100% ; overflow:auto; padding:30px">
        <div class="model_dialog"> 
            <h2>DiffusionBee Extended support</h2>
            <p>Report a bug or request a feature on the project's GitHub page.</p>
            <button class="l_button" @click="open_issues">Open GitHub issues</button>
        </div>
       
    </div>
    
</template>

<script>
const ContactUs = {
    name: 'ContactUs',
    props: {app:Object, },
    components: {},
    mounted() {

    },
    data() {
        return {};
    },
    methods: {
        open_issues(){window.ipcRenderer.sendSync('open_url','https://github.com/0fif/diffusionbee-extended/issues');}
    },
}

export default ContactUs;
ContactUs.title = "Contact Us"
ContactUs.icon = "file"
ContactUs.img_icon = require("../assets/imgs/page_icon_imgs/default.png")
ContactUs.home_category = undefined
ContactUs.hide_in_sidebar = true
ContactUs.sidebar_show = "never"
// add this to the always_on_pages to the PagesRouter

</script>
<style>
</style>

<style scoped>
.model_dialog{
    position: fixed;
    width: 320px ;
    height:auto;
    background: var(--options-input-bg );
    left: calc( 50% -  var(--sidebar-width ) /2 + 175px );
    top:50%;
     transform: translateY(-50%) translateX(-50%);
    z-index: 1000;
    padding:20px;
}

</style>