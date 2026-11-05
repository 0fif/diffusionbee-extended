// Real Vue rendering and disk IPC, isolated from the user's History.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'db-history-'));
app.setPath('userData',path.join(dir,'profile'));
let failWrite=false;
const native=fs.readFileSync(path.join(__dirname,'../src/native_functions.js'),'utf8');
new Function('ipcMain','require',native.slice(native.indexOf('function save_json('),native.indexOf("ipcMain.on('delete_file'")))(ipcMain,name=>name==='os'?{homedir:()=>dir}:name==='fs'?{...fs,renameSync:(...args)=>{if(failWrite)throw Error('Disk unavailable');return fs.renameSync(...args);}}:require(name));
ipcMain.on('test-fail-write',(e,value)=>{failWrite=value;e.returnValue=true;});
app.whenReady().then(async()=>{
 const w=new BrowserWindow({show:false,webPreferences:{nodeIntegration:true,contextIsolation:false}});
 try{await w.loadURL('about:blank');console.log(await w.webContents.executeJavaScript(`(${run.toString()})(${JSON.stringify(path.resolve(__dirname,'..'))})`));
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'.diffusionbee/history.json'))).history.constructor,Object);
 assert(!fs.readdirSync(path.join(dir,'.diffusionbee')).some(x=>x.endsWith('.tmp')));app.exit(0);
 }catch(error){console.error(error);app.exit(1);}
});
async function run(root){
 const fs=require('fs'),path=require('path'),assert=require('assert'),Vue=require(path.join(root,'node_modules/vue/dist/vue.cjs.js'));
 window.ipcRenderer=require('electron').ipcRenderer;
 const source=require(path.join(root,'node_modules/@vue/compiler-sfc')).parse(fs.readFileSync(path.join(root,'src/pages/History.vue'),'utf8')).descriptor;
 const component=new Function('GalleryPane','image_manu_functions','migrate_history_only_once','native_confirm','Fuse',source.script.content.replace(/^import .*$/gm,'').split('export default History;')[0]+';return History;')({template:'<div/>'},{},()=>({}),()=>true,require(path.join(root,'node_modules/fuse.js')));
 // Render the actual history list without unrelated gallery/menu dependencies.
 component.template='<div><div v-for="item in history_to_show" :key="item.key">{{item.prompt}}</div></div>';
 const errors=[],app={functions:{},app_state:{},show_toast:e=>errors.push(e)};
 let instance,host;
 function mount(){const element=document.createElement('div');document.body.appendChild(element);host=Vue.createApp(component,{app});instance=host.mount(element);}
 const group={imgs:[{image_url:'/test/eye.png',params:{prompt:'Fix the eye',seed:123}}],img_width:800,img_height:600};
 mount();assert(instance.add_to_history('eye',group));await Vue.nextTick();assert(instance.$el.textContent.includes('Fix the eye'));
 assert(instance.add_to_history('eye',group));assert.equal(Object.keys(instance.history).length,1,'Repeated completion must not duplicate');
 host.unmount();mount();assert.equal(Object.keys(instance.history).length,1,'Completed result survives remount/reload');
 instance.searchText='eye';assert.equal(instance.history_to_show.length,1);
 assert(!instance.add_to_history('failure',{imgs:[{image_url:'ERROR'}]}));assert(!instance.add_to_history('pending',{imgs:[{}]}));
 window.ipcRenderer.sendSync('test-fail-write',true);
 assert.equal(instance.delete_hist('eye'),false);assert(instance.history.eye);assert.equal(errors.length,1);
 window.ipcRenderer.sendSync('test-fail-write',false);host.unmount();mount();assert(instance.history.eye,'Failed replacement preserves previous file');
 assert(instance.delete_hist('eye'));host.unmount();mount();assert.equal(Object.keys(instance.history).length,0,'Deletion survives reload');
 instance.add_to_history('eye',group);instance.clear_history();host.unmount();mount();assert.equal(Object.keys(instance.history).length,0,'Clear survives reload');host.unmount();
 return 'PASS: automatic completion persistence, deduplication, search, reload, delete/clear, failed/pending exclusion, atomic-write failure recovery';
}
setTimeout(()=>{console.error('History checks timed out');app.exit(1);},20000);
