const js=require('@eslint/js');
const vue=require('eslint-plugin-vue');
const globals=require('globals');
module.exports=[
    {ignores:['dist_electron/**','node_modules/**','dist/**']},
    js.configs.recommended,...vue.configs['flat/essential'],
    {languageOptions:{globals:{...globals.browser,...globals.node}},rules:{'vue/multi-word-component-names':'off','vue/no-mutating-props':'off','vue/no-reserved-component-names':'off','no-unused-vars':['error',{caughtErrors:'none'}]}},
    {files:['**/*.vue'],languageOptions:{parserOptions:{sourceType:'module',ecmaVersion:'latest'}}}
];
