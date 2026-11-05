const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'db-navigation-')));
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:true,contextIsolation:false}});
 try{await win.loadFile(path.join(__dirname,'../public/index.html'));console.log(await win.webContents.executeJavaScript(`(${run.toString()})(${JSON.stringify(path.resolve(__dirname,'..'))})`));app.exit(0);}
 catch(error){console.error(error);app.exit(1);}
});
async function run(root){
 const fs=require('fs'),path=require('path'),assert=require('assert');
 const Vue=require(path.join(root,'node_modules/vue/dist/vue.cjs.js'));
 const parse=require(path.join(root,'node_modules/@vue/compiler-sfc')).parse;
 const source=parse(fs.readFileSync(path.join(root,'src/components/PagesRouter.vue'),'utf8')).descriptor.script.content;
 const names=[...source.matchAll(/^import (\w+) from /gm)].map(m=>m[1]);
 const pages=names.map(name=>{
  const page={template:'<div/>'};
  if(name==='AppletPage')return page;
  const text=fs.readFileSync(path.join(root,'src/pages',name+'.vue'),'utf8');
  for(const match of text.matchAll(/^\w+\.(title|sidebar_show|home_category)\s*=\s*(.*)$/gm))page[match[1]]=new Function('return '+match[2])();
  return page;
 });
 const router=new Function(...names,source.replace(/^import .*$/gm,'').replace('export default','return'))(...pages);
 router.template='<nav><button v-for="item in all_sidebar_items" :key="item.id" @click="switch_page(item.id)">{{item.text}}</button></nav>';
 const state=Vue.reactive({functions:{},app_state:{registered_ext_applets:{}},all_pages_ready:false});
 // Old visit history must not affect visibility, even if stale or corrupted.
 localStorage.setItem('last_opened_times_7768','invalid old data');
 const element=document.createElement('div');document.body.appendChild(element);
 const host=Vue.createApp(router,{app:state});const vm=host.mount(element);
 const ids=()=>vm.all_sidebar_items.map(item=>item.id);
 assert(ids().includes('Settings'),'Settings visible on a fresh launch');
 assert(!ids().includes('Training'),'Unimplemented Training is not advertised');
 assert(!vm.all_applet_items.some(item=>item.id==='Training'),'Training absent from Home too');
 assert(!ids().includes('Logs')&&!ids().includes('ContactUs'),'Menu-only pages remain hidden');
 state.app_state.registered_ext_applets.frame_interpolate={id:'frame_interpolate',title:'Interpolator',home_category:'misc'};
 for(const [id,title] of [['lora_merger','LoRA Tools'],['deforum','Deforum Video'],['lora_training','Training']])state.app_state.registered_ext_applets[id]={id,title,home_category:'misc'};
 await Vue.nextTick();
 for(const id of ['lora_merger','deforum','lora_training'])assert(ids().includes(id),'Backend tool visible: '+id);
 assert(vm.all_sidebar_items.every(item=>item.id==='frame_interpolate'||!['deforum','lora_training','lora_merger'].includes(item.id)||item.icon),'Backend tools have icons');
 assert(ids().includes('frame_interpolate'),'Interpolator appears on registration, before any visit');
 assert(vm.$el.textContent.includes('Interpolator'),'Sidebar actually renders the tool');
 const initial=ids();
 for(const id of ['frame_interpolate','Settings','Logs','ContactUs','Homepage']){vm.switch_page(id);await Vue.nextTick();assert.deepEqual(ids(),initial,'Visiting pages must not alter navigation');}
 host.unmount();
 const remount=Vue.createApp(router,{app:state}).mount(element);assert.deepEqual(remount.all_sidebar_items.map(item=>item.id),initial,'Restart preserves the same navigation');
 return 'PASS: fresh startup, late backend registration, rendered Interpolator, stable navigation, Settings, hidden menu-only pages, no unfinished Training, restart';
}
setTimeout(()=>{console.error('Navigation test timed out');app.exit(1);},20000);
