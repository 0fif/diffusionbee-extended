const {BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),{pathToFileURL}=require('url');
async function openImagePreview(source) {
    if(typeof source!=='string'||!path.isAbsolute(source)||! /\.(png|jpe?g|webp|gif|bmp)$/i.test(source)||!fs.statSync(source).isFile())throw Error('This image could not be opened.');
    const preview=new BrowserWindow({width:900,height:700,title:path.basename(source),show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,javascript:false}});
    preview.removeMenu();
    preview.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    preview.webContents.on('will-navigate',event=>event.preventDefault());
    try {
        await preview.loadURL(pathToFileURL(source).href);
        await preview.webContents.insertCSS('body{margin:0;background:#202124}img{display:block!important;margin:auto!important;width:100vw!important;height:100vh!important;object-fit:contain!important}');
        preview.show();return preview;
    } catch(error){preview.destroy();throw error;}
}
module.exports={openImagePreview};
