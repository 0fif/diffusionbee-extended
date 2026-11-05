import { createApp } from 'vue'
import { installVueLibraries } from './init_vue_libs.js'
import AppDemoUI from './AppDemoUI.vue'

const application = createApp(AppDemoUI)
installVueLibraries(application)
application.mount('#app')
