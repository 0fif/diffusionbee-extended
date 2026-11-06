import { ipcMain, dialog, clipboard } from 'electron'
import { app , screen } from 'electron'
import settings from 'electron-settings';

const path = require('path');

var win;


function bind_window_native_functions(w) {
    console.log("browser object binded")
    win = w;
}


let is_windows = process.platform.startsWith('win');



console.log(require('os').freemem()/(1000000000) + " Is the free memory")
console.log(require('os').totalmem()/(1000000000) + " Is the total memory")


// Read the backend bundle's own identity rather than pretending the source UI is newer.
ipcMain.handle('preview_image', async (_event, source) => {
    await require('./image_preview.cjs').openImagePreview(source);
    return true;
});

ipcMain.handle('model-file-size', (_, filename) => {
    const stat = require('fs').statSync(filename);
    return stat.isFile() ? stat.size : null;
});

ipcMain.handle('backend_info', () => {
    const fs = require('fs');
    const backend = process.env.BIN_PATH || (app.isPackaged ? path.join(process.resourcesPath, 'core/diffusionbee_backend') : null);
    let info = {build: 29, version: 'source', modern_models: false};
    if (backend) {
        try {
            const metadataPath = app.isPackaged ? path.join(process.resourcesPath, 'legacy-backend.json') : path.join(path.dirname(backend), '../app.asar/package.json');
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            const build = Number(metadata.build_number);
            info = {build, version: metadata.version, modern_models: build >= 40 && process.platform === 'darwin' && process.arch === 'arm64'};
        } catch (err) { console.warn('Could not identify backend bundle:', err.message); }
    }
    return info;
});

ipcMain.on('save_dialog', (event, ...args) => {

    const filename = args[0] ? args[0] : "Untitled"
    const ext = (args[1] || 'png').replace(/^\./, '')
   
    let trimmedFilename = filename.substring(0, 254) // filename size limit
     let save_path = dialog.showSaveDialogSync({
            title: 'Save Image',
            defaultPath: trimmedFilename,
            filters: [{
              name: 'Image',
              extensions: [ext]
            }]
          })

     event.returnValue = save_path;
} )

console.log(require('os').release() + " ohoho")



ipcMain.on('file_dialog', (event, arg) => {
    console.log("file dialog request recieved" + arg) // prints "ping"
    let properties;
    let options;

    if (arg == "folder") // single folder 
    {
        properties = ['openDirectory'];
        options = { properties: properties } ;
    }
    else if(arg == 'img_file') // single image file 
    {
        properties = ['openFile' ]
        options = { filters :[ {name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'bmp']}] , properties: properties } ;
    }
    else if(arg == 'weights_file') // single image file 
    {
        properties = ['openFile' ]
        options = { filters :[ {name: 'Checkpoints', extensions: ['ckpt' , 'safetensors' ]}] , properties: properties } ;
    }
    else if(arg == 'img_files') // multi image files
    {
        properties = ['multiSelections' , 'openFile' ]
        options = { filters :[ {name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'bmp']}] , properties: properties } ;
    }
    else if(arg == 'text_files') // multi image files
    {
        properties = ['multiSelections' , 'openFile' ]
        options = { filters :[ {name: 'Images', extensions: ['txt']}] , properties: properties } ;
    }
    else if(arg == 'audio_files') // multi image files
    {
        properties = ['multiSelections' , 'openFile' ]
        options = { filters :[ {name: 'Images', extensions: ['mp3', 'wav']}] , properties: properties } ;
    }
    else if(arg == 'video_files') // multi image files
    {
        properties = ['multiSelections' , 'openFile' ]
        options = { filters :[ {name: 'Images', extensions: ["mp4", "mov", "avi", "flv", "wmv", "mkv"]}] , properties: properties } ;
    }
    else if(arg == 'any_files') // multi image files
    {
        properties = ['multiSelections' , 'openFile' ]
        options = {  properties: properties } ;
    }
    else
    {
        properties = ['openFile'];
        options = { properties: properties } ;
    }

    // let options = {
    //     See place holder 1 in above image
    //     title : "Custom title bar", 
    //     message : "Custom title bar",

    //     buttonLabel : "Custom button",

    //     See place holder 4 in above image
    //     filters :[
    //      {name: 'Images', extensions: ['jpg', 'png', 'gif']},
    //      {name: 'Movies', extensions: ['mkv', 'avi', 'mp4']},
    //      {name: 'Custom File Type', extensions: ['as']},
    //      {name: 'All Files', extensions: ['*']}
    //     ],
    //     properties: properties
    // }

    // //Synchronous
    let filePaths = dialog.showOpenDialogSync(options)

    if (filePaths && filePaths.length > 0)
        event.returnValue = filePaths.join(";;;");
    else
        event.returnValue = "NULL";
})




ipcMain.on('open_url', (event, url) => {
    let website_domain = require('../package.json').website ; 
    url = url.replace("__domain__" , website_domain );
    if (/^https?:\/\//i.test(url)) require('electron').shell.openExternal(url);
    event.returnValue = '';
})



ipcMain.on('save_encoded_image', (event, destination, encoded) => {
    const fs = require('fs');
    const temporary = destination + '.' + require('crypto').randomBytes(8).toString('hex') + '.tmp';
    try {
        const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(encoded);
        if (!match || !(match[1] === 'jpeg' ? /\.jpe?g$/i : /\.png$/i).test(destination))
            throw new Error('The export format does not match the filename.');
        fs.writeFileSync(temporary, Buffer.from(match[2], 'base64'));
        fs.renameSync(temporary, destination);
        event.returnValue = {success:true};
    } catch (error) {
        try { fs.unlinkSync(temporary); } catch (_) { /* No temporary file may have been written. */ }
        event.returnValue = {success:false, error:error.message};
    }
});

ipcMain.on('save_file', (event, source, destination) => {
    const [p1, p2] = destination === undefined ? source.split('||') : [source, destination];
    try {
        require('fs').copyFileSync(p1, p2);
        event.returnValue = true;
    } catch (error) {
        dialog.showErrorBox('Could not save image', error.message);
        event.returnValue = false;
    }
})


ipcMain.on('copy_to_clipboard', (event, arg) => {
    clipboard.writeText(arg)
    event.returnValue = '';
})


ipcMain.on('get_from_clipboard', (event) => {
    event.returnValue = clipboard.readText();
})


ipcMain.on('show_dialog_on_quit', (event, msg) => {
    if(win)
    {
        win.show_dialog_on_quit = true;
        win.dialog_on_msg = msg;
    }
    event.returnValue = 'ok';

})


ipcMain.on('dont_show_dialog_on_quit', (event) => {
    if(win)
        win.show_dialog_on_quit = false;
    event.returnValue = 'ok';

})


ipcMain.on('get_instance_id', (event) => {
    if (settings.hasSync('instance_id')){
        event.returnValue =  settings.getSync('instance_id')
        return;
    }
    let instance_id =  (Math.random() + 1).toString(36);
    settings.set('instance_id', instance_id);
    event.returnValue =   instance_id;

})


ipcMain.on('unfreeze_win', (event) => {

    if (win) {
	win.savable=true;
        const primaryDisplay = screen.getPrimaryDisplay()
        const { width, height } = primaryDisplay.workAreaSize

        if (settings.hasSync('windowPosState')) {
            let windowState = settings.getSync('windowPosState');
            console.log("stateeee")
            console.log(windowState)

            if( windowState.x  >  0.8*width ||  windowState.y  >  0.8*height ||  windowState.x  < -0.2*width || windowState.y  < -0.2*height    ){
                win.setSize(850, 650, false);
            } else {
               win.setPosition( windowState.x  ,  windowState.y  , false);
               win.setMinimumSize(1070, 700);
                win.setSize(windowState.width, windowState.height , false); 
            }

            
        }
        else{
            win.setMinimumSize(1070, 700);
            win.setSize(850, 650, false);
        }

        win.setMinimumSize(1070, 700);
        // win.setResizable(true);
        win.setMaximizable(true);


        
        
    }

    event.returnValue = 'ok';

})



ipcMain.on('freeze_win', (event) => {

    if (win) {
	win.savable=false;
	win.restore()
        win.setMinimumSize(770, 550)
        win.setSize(770, 550, false); 
        // win.setResizable(false);
        win.setMaximizable(false);

        const primaryDisplay = screen.getPrimaryDisplay()
        const { width, height } = primaryDisplay.workAreaSize;

        console.log( width +" " +  height)

        win.setPosition( parseInt((width-770)/2)  , parseInt((height-550)/2), false);

              

    }

    event.returnValue = 'ok';

})



ipcMain.on('show_about', (event) => {

    if (win) {

        if(is_windows)
        {
            let about_content = require('../package.json').productName + "\n" + "Version " + require('../package.json').version + " (" + require('../package.json').build_number + ")\n" + require('../package.json').description;
            require('electron').dialog.showMessageBoxSync(win, {
                buttons: ['Okay'],
                title: require('../package.json').productName ,
                message: about_content
            });
        }
        else{
            app.showAboutPanel()
        }

        
    }

    event.returnValue = 'ok';

})




ipcMain.on('native_confirm', (event, message) => {
    event.returnValue = win ? require('electron').dialog.showMessageBoxSync(win, {
        type: 'question',
        buttons: ['Yes', 'No'],
        defaultId: 1,
        cancelId: 1,
        title: require('../package.json').productName,
        message
    }) === 0 : false;
});

ipcMain.on('close_window', (event) => {

    if (win) {
        
        win.close()
        event.returnValue = true ;
    }
    else{
        event.returnValue = false ;
    }

})




ipcMain.on('native_alert', (event, arg) => {

    if (win) {
        
        require('electron').dialog.showMessageBoxSync(win, {
            buttons: ['Okay'],
            title: require('../package.json').productName ,
            message: arg
        });
        
    }
    
    event.returnValue = true ;

})




ipcMain.on('save_b64_image', (event, encoded, temporary) => {
    const fs = require('fs');
    try {
        if (typeof encoded !== 'string' || !encoded.startsWith('data:image/png;base64,')) throw Error('Expected a PNG image.');
        const directory = temporary ? require('os').tmpdir() : path.join(process.env.DIFFUSIONBEE_DATA_DIR || path.join(require('os').homedir(), '.diffusionbee'), 'inp_images');
        fs.mkdirSync(directory, {recursive:true});
        const filename = path.join(directory, require('crypto').randomUUID() + '.png');
        fs.writeFileSync(filename, Buffer.from(encoded.slice('data:image/png;base64,'.length), 'base64'));
        event.returnValue = filename;
    } catch (error) {
        console.error('Could not save image data:', error.message);
        event.returnValue = null;
    }
});


function save_json(data , fname ){
    const path = require('path');
    const fs = require('fs');
    const homedir = require('os').homedir();
    let save_dir = path.join(process.env.DIFFUSIONBEE_DATA_DIR || path.join(homedir, '.diffusionbee'))


    if (!fs.existsSync(save_dir)){
        fs.mkdirSync(save_dir, { recursive: true });
    }

    let data_path = path.join(process.env.DIFFUSIONBEE_DATA_DIR || path.join(homedir, '.diffusionbee') , fname )
    // Preserve damaged data before a later successful save replaces it.
    if (fs.existsSync(data_path)) {
        const existing = fs.readFileSync(data_path, 'utf8');
        try { JSON.parse(existing); }
        catch (_) { fs.copyFileSync(data_path, data_path + '.corrupt-' + require('crypto').randomBytes(8).toString('hex')); }
    }
    const temporary = data_path + '.' + require('crypto').randomBytes(8).toString('hex') + '.tmp';
    try {
        fs.writeFileSync(temporary, JSON.stringify(data));
        fs.renameSync(temporary, data_path);
    } finally {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
}



function load_data(fname){
    const path = require('path');
    const fs = require('fs');
    const homedir = require('os').homedir();
    let data_path = path.join(process.env.DIFFUSIONBEE_DATA_DIR || path.join(homedir, '.diffusionbee') , fname );

    if (fs.existsSync(data_path)){
        let json_str = fs.readFileSync( data_path );
        try {
            return JSON.parse(json_str);
          } catch (error) {
            return {} ;
          }
    }
    else{
        return {} ;
    }       
}

ipcMain.on('save_data', (event, arg, fname) => {
    try {
        save_json(arg, fname || 'data.json');
        event.returnValue = true;
    } catch (error) {
        console.error('Could not save application data:', error.message);
        event.returnValue = false;
    }
});


ipcMain.on('load_data', (event, fname) => {
    if(fname)
        event.returnValue = load_data(fname)
    else
        event.returnValue = load_data("data.json")
})


ipcMain.on('delete_file', (event, fpath) => {
    const fs = require('fs');
    try{
        fs.unlinkSync(fpath);
        console.log("deleted")
        event.returnValue = true;
    } catch (error) {
        console.log("err in deleting")
        event.returnValue = error.code === 'ENOENT';
    }
    
})


function add_custom_pytorch_models(source, name, cleanup) {
    const fs = require('fs');
    const script = process.env.PY_SCRIPT || '../backends/stable_diffusion/diffusionbee_backend.py';
    const binary = process.env.BIN_PATH || ((!app.isPackaged && fs.existsSync(script)) ? 'python3' : path.join(process.resourcesPath, 'core', 'diffusionbee_backend'));
    const args = !process.env.BIN_PATH && (!app.isPackaged && fs.existsSync(script)) ? [script] : [];
    const directory = path.join(process.env.DIFFUSIONBEE_DATA_DIR || path.join(require('os').homedir(), '.diffusionbee'), 'imported_models');
    return require('./convert_model.cjs').convertModel({binary, args, source, name, directory, cleanup});
}

ipcMain.handle('add_custom_pytorch_models', async (_event, source, name, cleanup) => {
    try { return await add_custom_pytorch_models(source, name, cleanup); }
    catch (error) { return {success:false, error:(error.stderr || error.message).slice(-2000)}; }
});

ipcMain.handle('cancel-upscale', () => require('./upscale.cjs').cancel());
ipcMain.handle('run_realesrgan', (_event, input) => {
    const binary = process.env.REALESRGAN_BIN || path.join(process.resourcesPath, 'core', 'realesrgan_ncnn_macos');
    return require('./upscale.cjs').runUpscale(input, binary, path.join(process.env.DIFFUSIONBEE_DATA_DIR || path.join(require('os').homedir(), '.diffusionbee'), 'images'));
});

// ipcRenderer.invoke('run_realesrgan', '/Users/divamgupta/Downloads/333.png' ).then((result) => {
//     alert(result)
//   })



ipcMain.on('list_imported_models', (event) => {
    const path = require('path');
    const fs = require('fs');
    const homedir = require('os').homedir();
    let models_path = path.join(process.env.DIFFUSIONBEE_DATA_DIR || path.join(homedir, '.diffusionbee') , "imported_models");

    if (!fs.existsSync(models_path)){
        fs.mkdirSync(models_path, { recursive: true });
    }

    event.returnValue = fs.readdirSync(models_path, {withFileTypes: true}).filter(item => !item.isDirectory()).map(item => item.name).filter(item => item.endsWith('.tdict'))

})





ipcMain.on('get_assets_dir', (event) => {
    const path = require('path');
    const fs = require('fs');
    const homedir = require('os').homedir();
    let assets_path = path.join(process.env.DIFFUSIONBEE_DATA_DIR || path.join(homedir, '.diffusionbee') , "downloaded_assets");

    if (!fs.existsSync(assets_path)) {
        fs.mkdirSync(assets_path, { recursive: true });
    }

    event.returnValue = assets_path;
});



const activeDownloads = new Map();
ipcMain.on('download-file', (event, url, dest, downloadId, checksum) => {
    const key = event.sender.id + ':' + downloadId;
    const send = (fn, msg) => {
        if (fn !== 'progress') activeDownloads.delete(key);
        if (!event.sender.isDestroyed()) event.sender.send('to_download', {fn, download_id:downloadId, msg});
    };
    const cancel = require('./model_download.cjs').downloadModel({url, dest, checksum,
        progress: value => send('progress', value),
        complete: digest => send('success', digest), failed: error => send('error', error)});
    activeDownloads.set(key, cancel);
});
ipcMain.on('cancel-download', (event, downloadId) => {
    const cancel = activeDownloads.get(event.sender.id + ':' + downloadId);
    if (cancel) cancel();
});


console.log("native functions imported")


export { bind_window_native_functions }
