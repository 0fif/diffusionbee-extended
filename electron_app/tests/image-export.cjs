const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'db-export-'));
app.setPath('userData',path.join(dir,'profile'));
app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,webPreferences:{nodeIntegration:true,contextIsolation:false,webSecurity:false}});await w.loadURL('about:blank');try{console.log(await w.webContents.executeJavaScript(`(${run.toString()})(${JSON.stringify(path.resolve(__dirname,'..'))},${JSON.stringify(dir)})`));app.exit(0);}catch(e){console.error(e);app.exit(1);}});
async function run(root,dir){
const fs=require('fs'),path=require('path'),assert=require('assert');
const {export_image,image_export_format}=new Function(fs.readFileSync(path.join(root,'src/utils/image_export.js'),'utf8').replace(/export /g,'')+';return {export_image,image_export_format};')();
assert.equal(image_export_format('PHOTO.JPG'),'jpg');assert.equal(image_export_format('photo.png'),'png');
const native=fs.readFileSync(path.join(root,'src/native_functions.js'),'utf8');let save;
new Function('ipcMain','require','Buffer',native.slice(native.indexOf("ipcMain.on('save_encoded_image'"),native.indexOf("ipcMain.on('save_file'")))({on:(_,fn)=>save=fn},require,Buffer);
let destination=path.join(dir,'export.jpg'),writes=0;
window.ipcRenderer={sendSync:(channel,...args)=>{if(channel==='save_dialog')return destination;const event={};save(event,...args);writes++;return event.returnValue;}};
const canvas=document.createElement('canvas');canvas.width=301;canvas.height=173;canvas.getContext('2d').fillStyle='red';canvas.getContext('2d').fillRect(20,20,100,100);
const original=canvas.toDataURL();await export_image(original,'jpg','test.jpg');
assert.equal(fs.readFileSync(destination).subarray(0,2).toString('hex'),'ffd8');
const load=url=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=url;});
const jpg=await load('file://'+destination);assert.equal(jpg.width,301);assert.equal(jpg.height,173);
const pixels=document.createElement('canvas');pixels.width=301;pixels.height=173;pixels.getContext('2d').drawImage(jpg,0,0);assert(pixels.getContext('2d').getImageData(0,0,1,1).data[0]>250,'JPEG transparency flattens to white');
destination=path.join(dir,'export.png');await export_image(original,'png','test.png');assert.equal(fs.readFileSync(destination).subarray(0,8).toString('hex'),'89504e470d0a1a0a');
const png=await load('file://'+destination);pixels.getContext('2d').clearRect(0,0,301,173);pixels.getContext('2d').drawImage(png,0,0);assert.equal(pixels.getContext('2d').getImageData(0,0,1,1).data[3],0);
await assert.rejects(export_image(original,'jpg','test.jpg'),/filename/);
const before=writes;destination=undefined;assert.equal(await export_image(original,'jpg','test.jpg'),false);assert.equal(writes,before);
destination=path.join(dir,'missing','export.jpg');await assert.rejects(export_image(original,'jpg','test.jpg'),/ENOENT/);
return {status:'PASS: source defaults, real encodings, dimensions, transparency, cancellation, extension mismatch, save failure'};
}
