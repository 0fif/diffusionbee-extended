import { ipcMain, app } from 'electron'

var win;
let legacyEngine;


var is_app_closing = false;


let renderer_ready = false;
const initial_state = new Map();



const path = require('path');
const upscaler = require('./upscale.cjs');
const {createMfluxEngine} = require('./mflux_engine.cjs');
const root = path.resolve(process.cwd(), '..');
const runtime = require('./runtime_paths.cjs').runtimePaths({packaged:app.isPackaged, resources:process.resourcesPath, project:root, userData:app.getPath('userData')});
const modernEngine = createMfluxEngine({
    ...runtime,
    outputDir: path.join(process.env.DIFFUSIONBEE_DATA_DIR || path.join(require('os').homedir(), '.diffusionbee'), 'images'),
    emit: line => {if (win && !win.isDestroyed() && !is_app_closing) win.webContents.send('to_renderer', 'py2b ' + line);}
});
const resolveDownloadSize = require('./model_previews.cjs').createDownloadSizeResolver();
ipcMain.handle('model-download-size', (_, model, refresh) => resolveDownloadSize(model, refresh));
const resolvePreview = require('./model_previews.cjs').createPreviewResolver();
const resolveModelMetadata = require('./model_previews.cjs').createMetadataResolver();
ipcMain.handle('model-metadata', (_, model, refresh) => resolveModelMetadata(model, refresh));
ipcMain.handle('model-preview', (_, model, refresh) => resolvePreview(model, refresh));
ipcMain.handle('mflux-remove', (_, id) => modernEngine.remove(id));
ipcMain.handle('mflux-status', () => modernEngine.status());
ipcMain.handle('mflux-metadata', (_, id) => modernEngine.metadata(id));
ipcMain.handle('mflux-install', (event, id) => modernEngine.install(id, update => {
    if (!event.sender.isDestroyed()) event.sender.send('mflux-install-progress', {id, ...update});
}));
ipcMain.handle('mflux-cancel-install', () => modernEngine.cancelInstall());


function send(line) {
    if (win && !win.isDestroyed() && !is_app_closing) win.webContents.send('to_renderer', 'py2b ' + line);
}
function start_bridge() {
    const fs = require('fs');
    const script = process.env.PY_SCRIPT || '../backends/stable_diffusion/diffusionbee_backend.py';
    const binary = process.env.BIN_PATH || ((!app.isPackaged && fs.existsSync(script)) ? 'python3' : path.join(runtime.core, 'diffusionbee_backend'));
    const args = !process.env.BIN_PATH && (!app.isPackaged && fs.existsSync(script)) ? [script] : [];
    legacyEngine = require('./legacy_engine.cjs').createLegacyEngine({binary, args,
        line(line) {
            if (line.startsWith('utds registered_ext_applets.')) initial_state.set(line.split('___U_P_D_A_T_E___')[0], line);
            if (line === 'sdbk mdld') initial_state.set('model_loaded', line);
            if (renderer_ready && !(line === 'sdbk inrd' && (modernEngine.busy || upscaler.busy))) send(line);
        },
        log(message) { if (win && !win.isDestroyed() && !is_app_closing) win.webContents.send('to_renderer', 'adlg ' + message); },
        failed(message) {
            const update = 'utds legacy_backend_error___U_P_D_A_T_E___' + JSON.stringify(message);
            initial_state.set('legacy_error', update);
            initial_state.set('model_loaded', 'sdbk mdld');
            send(update); send('sdbk mdld');
            // A failed optional engine must not terminate the other engine's job.
            if (!modernEngine.busy && !upscaler.busy) { send('sdbk errr ' + message); send('sdbk inrd'); }
        }
    });
    legacyEngine.start();
}

ipcMain.on('to_python_sync', (event, arg) => {
    event.returnValue = 'ok';
    if (arg === 'strt') {
        renderer_ready = true;
        for (const line of initial_state.values()) send(line);
        if (initial_state.has('legacy_error')) { send('sdbk inrd'); return; }
    }
    if (modernEngine.handle(arg)) return;
    if (!legacyEngine.write(arg)) {
        send('sdbk errr Legacy engine is unavailable. Restart the app to use legacy models.');
        send('sdbk inrd');
    }
});

app.on('will-quit', () => {
    is_app_closing = true;
    modernEngine.close();
    require('./convert_model.cjs').close();
    upscaler.cancel(true);
    if (legacyEngine) legacyEngine.close();
});

function bind_window_bridge(w) {
    console.log("browser object binded")
    win = w;
}


export { start_bridge, bind_window_bridge }
