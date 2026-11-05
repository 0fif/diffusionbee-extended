<template>

        <div class="options_input dropdown-input" :class="{'model-input': config.id === 'selected_sd_model'}">
            <!-- <span v-html="icon_library"></span> -->
            
            <svg width="19px" height="19px"  v-html="icon_library[config.icon]"> </svg>


            <b-form-select class="custom-select" v-model="form_values[config.id]" :options="config.options.map(value => ({value, text: config.option_labels?.[value] || value}))" :aria-label="config.id === 'selected_sd_model' ? 'Model' : (config.title || config.id)" :title="config.option_labels?.[form_values[config.id]] || String(form_values[config.id] || '')"
                required><template v-if="config.id === 'selected_sd_model' && !config.options.includes(form_values[config.id])" #first><b-form-select-option :value="form_values[config.id]" disabled>Choose an available model</b-form-select-option></template></b-form-select>
        </div>
</template>
<script>

import FormInputMixin from "./FormInputMixin.vue"
import { icon_library } from "../icon_library.js"
export default {
    name: 'Dropdown',
    mixins: [FormInputMixin],
    props: {
        config: Object , 
        form_values: Object,
    },
    components: {},
    
    mounted() {
        if(this.form_values[this.config.id] === undefined){
            this.form_values[this.config.id] = this.config.default_value || this.config.options[0]
        }
        this.reset_selected_if_invalid()
    },
    data() {
        return {
            icon_library:icon_library,
        };
    },
    methods: {
        // if the selected option not in options list then reset the selected 
        reset_selected_if_invalid(){
            if (this.config.id === 'selected_sd_model') return;
            if(!this.config.options.includes(this.form_values[this.config.id])){
                  if(this.config.options.length > 0){
                    if( this.config.default_value != undefined && this.config.options.includes(this.config.default_value) ){
                        this.form_values[this.config.id] = this.config.default_value
                    } else {
                        this.form_values[this.config.id] = this.config.options[0]
                    }
                    
                  }
              }
        }
    },

    watch : {
       
       'config.options': {
           handler: function() {
              this.reset_selected_if_invalid()
           },
           deep: true
       } , 

   },


}
</script>
<style>
</style>
<style scoped>
.dropdown-input {width:95px;margin-left:6px;}
.model-input {width:100%;margin:6px 0 0;}
.model-input :deep(select) {width:100%;text-align:left;}
.model-input :deep(select:focus-visible) {outline:2px solid var(--title-icon_color);outline-offset:4px;}



</style>