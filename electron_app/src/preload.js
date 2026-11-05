// src/preload.js

import { contextBridge, ipcRenderer, webUtils } from 'electron'

// Expose only the app's IPC methods; Electron no longer bridges ipcRenderer itself.
const syncChannels = new Set([
    'to_python_sync', 'load_data', 'save_data', 'delete_file', 'get_assets_dir',
    'save_dialog', 'file_dialog', 'save_encoded_image', 'save_file', 'save_b64_image',
    'open_url', 'unfreeze_win', 'freeze_win', 'get_instance_id', 'show_dialog_on_quit',
    'dont_show_dialog_on_quit', 'copy_to_clipboard', 'show_about', 'close_window',
    'native_confirm', 'native_alert'
]);
const invokeChannels = new Set([
    'add_custom_pytorch_models', 'run_realesrgan', 'backend_info', 'mflux-status',
    'model-preview', 'model-download-size', 'model-file-size', 'mflux-install',
    'mflux-remove', 'mflux-cancel-install', 'model-metadata', 'mflux-metadata'
]);
function checkChannel(allowed, channel) {
    if (!allowed.has(channel)) throw new Error('Unsupported IPC channel: ' + channel);
}
contextBridge.exposeInMainWorld('ipcRenderer', {
    send(channel, ...args) {
        checkChannel(new Set(['download-file', 'cancel-download', 'open_url']), channel);
        ipcRenderer.send(channel, ...args);
    },
    sendSync(channel, ...args) {
        checkChannel(syncChannels, channel);
        return ipcRenderer.sendSync(channel, ...args);
    },
    invoke(channel, ...args) {
        checkChannel(invokeChannels, channel);
        return ipcRenderer.invoke(channel, ...args);
    },
    on(channel, callback) {
        checkChannel(new Set(['mflux-install-progress']), channel);
        const listener = (_event, data) => callback(data);
        ipcRenderer.on(channel, listener);
        return () => { ipcRenderer.removeListener(channel, listener); };
    }
});
contextBridge.exposeInMainWorld('getPathForFile', file => webUtils.getPathForFile(file));

var bind_ipc_renderer_on_fn = undefined;
var bind_ipc_download_on_fns = {}

function bind_ipc_renderer_on(fn) {
    bind_ipc_renderer_on_fn = fn;
}

contextBridge.exposeInMainWorld('bind_ipc_renderer_on', bind_ipc_renderer_on)

ipcRenderer.on("to_renderer", (e, data) => { // the msg channel which is used for electron to send msges to browser / renderer
    if (bind_ipc_renderer_on_fn)
        bind_ipc_renderer_on_fn(data)
});


function bind_ipc_download_on( download_id,  fn_progress , fn_success, fn_error ) {
    console.log("gineded " + download_id)
    bind_ipc_download_on_fns[download_id] = {
        "progress" : fn_progress,
        "success" : fn_success,
        "error" : fn_error,
    }
}

contextBridge.exposeInMainWorld('bind_ipc_download_on', bind_ipc_download_on)


function unbind_ipc_download_on( download_id ){
    bind_ipc_download_on_fns[download_id] = undefined;
}



contextBridge.exposeInMainWorld('unbind_ipc_download_on', unbind_ipc_download_on)


ipcRenderer.on("to_download", (e, data) => { // the msg channel which is used for electron to send msges to browser / download
    if(!bind_ipc_download_on_fns[data.download_id]){
        console.log("no fn di "+ data.download_id)
        return 
    }
    if(!bind_ipc_download_on_fns[data.download_id][data.fn]){
        console.log("no fn d ")
        return
    }
    bind_ipc_download_on_fns[data.download_id][data.fn](data.msg)
});

