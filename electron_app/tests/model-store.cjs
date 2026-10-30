const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'db-model-store-'));app.setPath('userData',profile);
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:1070,height:800,show:false,webPreferences:{nodeIntegration:true,contextIsolation:false,webSecurity:false}});
 try{
  fs.writeFileSync(path.join(profile,'index.html'),'<html><body></body></html>');
  await win.loadFile(path.join(profile,'index.html'));
  console.log(await win.webContents.executeJavaScript(`(${render.toString()})(${JSON.stringify(path.resolve(__dirname,'..'))})`));
  for(const width of [1070,770]){win.setSize(width,800);await new Promise(r=>setTimeout(r,150));fs.writeFileSync(path.join(profile,`models-${width}.png`),(await win.webContents.capturePage()).toPNG());}
  console.log('Models screenshots: '+profile);app.exit(0);
 }catch(e){console.error(e);app.exit(1);}
});
setTimeout(()=>{console.error('Models UI timed out');app.exit(1);},20000);
async function render(root){
 const assert=require('assert'),fs=require('fs'),path=require('path');
 const Vue=require(path.join(root,'node_modules/vue/dist/vue.common.js'));
 const compiler=require(path.join(root,'node_modules/vue-template-compiler'));
 const compatSource=fs.readFileSync(path.join(root,'src/utils/model_compatibility.js'),'utf8');
 const available=new Function(compatSource.replace(/export \{[^}]+\};/,'return model_available;'))();
 const detailSource=fs.readFileSync(path.join(root,'src/utils/model_details.js'),'utf8').replace(/^import .*$/gm,'').replace(/export /g,'');
 const d=new Function('validation','model_available',detailSource+';return {model_tasks,task_checks,validation_note,architecture_name};')(require(path.join(root,'src/data/model_validation.json')),available);
 const source=compiler.parseComponent(fs.readFileSync(path.join(root,'src/pages/ModelStore.vue'),'utf8'));
 const model=new Function('Vue','native_confirm','model_available','DownloadButton','model_tasks','task_checks','validation_note','architecture_name','require',source.script.content.replace(/^import .*$/gm,'').replace('export default ModelStore;','return ModelStore;'))(Vue,()=>false,available,{template:'<button>Download</button>'},d.model_tasks,d.task_checks,d.validation_note,d.architecture_name,p=>'file://'+path.resolve(root,'src/pages',p));
 model.template=source.template.content;
 const style=document.createElement('style');style.textContent=':root{--text-color-solid:#eee;--color-bg:#202124;--border-color-invert:#444;--sidebar-color:#303134}body{margin:0;font:14px system-ui;background:#202124}*{box-sizing:border-box}'+source.styles.map(s=>s.content).join('\n');document.head.appendChild(style);
 const catalog=require(path.join(root,'../backends/mflux/models.json')).map(m=>({...m}));catalog[1].partial=true;
 window.fetch=async()=>({ok:true,json:async()=>[{id:'untested-import',title:'Unverified checkpoint',model_meta_data:{type:'sd_model',sd_type:'sdxl_base'}}]});
 let listener;let fail=true;
 window.ipcRenderer={on:(_,fn)=>{listener=fn;},removeListener(){},sendSync:()=>'',invoke:async name=>{if(name==='mflux-metadata'){if(fail)throw Error('offline');return {downloads:0,likes:2,bytes:12345678,updated:'2026-10-29'};}return null;}};
 const app={is_mounted:true,modern_backend:{available:true,models:catalog},backend_info:{mflux:true,build:40,modern_models:true},assets_manager:{all_avail_assets:{}},refresh_modern_models:async()=>{},functions:{}};
 const host=new Vue({render:h=>h(model,{ref:'store',props:{app}})}).$mount();document.body.appendChild(host.$el);await new Promise(r=>setTimeout(r,100));
 const store=host.$refs.store;store.tab='discover';await Vue.nextTick();
 assert.equal(store.visible_models.length,3);
 store.search='nothing matches';await Vue.nextTick();assert.equal(store.visible_models.length,0);assert(host.$el.textContent.includes('No models match'));
 store.search='';store.task_filter='img2img';await Vue.nextTick();assert.equal(store.visible_models.length,3);
 await store.load_metadata(catalog[0],{target:{open:true}});assert(store.metadata_errors[catalog[0].id]);
 fail=false;await store.load_metadata(catalog[0],{target:{open:true}});assert(!store.metadata_errors[catalog[0].id]);assert.equal(store.metadata[catalog[0].id].downloads,0);
 store.installing=catalog[1].id;listener({}, {id:catalog[1].id,event:'download',completed_files:3,total_files:13,transferred_bytes:1073741824});await Vue.nextTick();
 assert.equal(host.$el.querySelector('progress').value,3);assert(host.$el.textContent.includes('3 / 13 files ready'));
 store.installing=null;await Vue.nextTick();assert(host.$el.textContent.includes('Resume download'));
 assert(host.$el.textContent.includes('Untested'));assert(host.$el.textContent.includes('FLUX.2 Klein 4B · 4-bit'));
 return 'PASS: actual Models rendering, task/search filters, empty state, metadata failure/retry/zero counts, file progress, resume label';
}
