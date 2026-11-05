import { createApp } from 'vue'
import { installVueLibraries } from './init_vue_libs.js'
import './py_vue_bridge.js'
import App from './App.vue'

const application = createApp(App)
installVueLibraries(application)
application.mount('#app')
