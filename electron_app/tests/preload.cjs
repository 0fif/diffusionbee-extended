// Exercise the production preload in a real sandboxed, isolated renderer.
const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'db-preload-'));
app.setPath('userData',path.join(dir,'profile'));
const preload=path.join(dir,'preload.cjs');
fs.writeFileSync(preload,fs.readFileSync(path.join(__dirname,'../src/preload.js'),'utf8').replace("import { contextBridge, ipcRenderer, webUtils } from 'electron'", "const { contextBridge, ipcRenderer, webUtils } = require('electron')"));
const image=path.join(dir,'image.png');fs.writeFileSync(image,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII=','base64'));
ipcMain.on('load_data',(e,value)=>{e.returnValue=value;});
ipcMain.handle('backend_info',()=>({ready:true}));
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,webPreferences:{preload,sandbox:true,contextIsolation:true,nodeIntegration:false}});
 try {
  await win.loadURL('about:blank');
  const evalJS=code=>win.webContents.executeJavaScript(code);
  assert.deepEqual(await evalJS(`(async()=>{
   if(typeof require!=='undefined') throw Error('Node exposed');
   if(window.ipcRenderer.sendSync('load_data','roundtrip')!=='roundtrip')throw Error('Sync failed');
   let blocked=false;try{window.ipcRenderer.sendSync('arbitrary-channel')}catch(_){blocked=true}if(!blocked)throw Error('Channel not blocked');
   window.updates=[];window.off=window.ipcRenderer.on('mflux-install-progress',data=>updates.push(data));
   return await window.ipcRenderer.invoke('backend_info');
  })()`),{ready:true});
  win.webContents.send('mflux-install-progress',{id:'test',percent:42});
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.deepEqual(await evalJS('updates'),[{id:'test',percent:42}]);
  await evalJS('off()');win.webContents.send('mflux-install-progress',{id:'test',percent:50});
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(await evalJS('updates.length'),1);
  win.webContents.debugger.attach('1.3');
  await evalJS("document.body.innerHTML='<input type=file id=file>'");
  const {root}=await win.webContents.debugger.sendCommand('DOM.getDocument');
  const {nodeId}=await win.webContents.debugger.sendCommand('DOM.querySelector',{nodeId:root.nodeId,selector:'#file'});
  await win.webContents.debugger.sendCommand('DOM.setFileInputFiles',{nodeId,files:[image]});
  assert.equal(await evalJS("window.getPathForFile(document.querySelector('#file').files[0])"),image);
  win.webContents.debugger.detach();
  console.log('PASS: sandboxed preload, sync/async IPC, allowed channels, data-only events, unsubscribe, real file paths');app.exit(0);
 } catch(error){console.error(error);app.exit(1);}
});
setTimeout(()=>{console.error('Preload check timed out');app.exit(1);},20000);
