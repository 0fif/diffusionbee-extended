const fs = require('fs');
const path = require('path');
const {spawn} = require('child_process');

function createMfluxEngine({runner, python, modelsDir, outputDir, emit, spawnProcess = spawn}) {
    const catalogPath = path.join(path.dirname(runner), 'models.json');
    const catalog = fs.existsSync(catalogPath) ? JSON.parse(fs.readFileSync(catalogPath, 'utf8')) : [];
    let generation, installation;
    const infoCache = new Map();
    function model(id) {
        const entry = catalog.find(m => m.id === id);
        if (!entry) throw new Error('This model is not supported by the installed image engine.');
        return entry;
    }
    function installed(entry) {
        const directory = path.join(modelsDir, entry.id);
        try {
            const marker = JSON.parse(fs.readFileSync(path.join(directory, '.installed.json'), 'utf8'));
            const valid = marker.repo === entry.repo && (!entry.revision || entry.revision === marker.revision) &&
                Object.entries(marker.files).every(([name, size]) => fs.statSync(path.join(directory, name)).size === size);
            return valid ? {asset_path:directory, bytes:marker.bytes, revision:marker.revision, status:'done'} : {};
        } catch (_) { return {}; }
    }
    function job(command, request, onEvent = () => {}) {
        let child, settled = false, buffer = '', stderr = '', result, cancelled = false, killTimer;
        const promise = new Promise((resolve, reject) => {
            const finish = (error, value) => {
                if (settled) return;
                settled = true; clearTimeout(killTimer);
                error ? reject(error) : resolve(value);
            };
            child = spawnProcess(python, ['-u', runner, command], {env:{...process.env, PYTHONUNBUFFERED:'1'}});
            child.on('error', error => finish(new Error('Could not start MFLUX: ' + error.message)));
            child.stdin.on('error', () => {});
            child.stdin.end(JSON.stringify({...request, models_dir:modelsDir, output_dir:outputDir}));
            child.stderr.on('data', data => {stderr = (stderr + data).slice(-3000);});
            child.stdout.on('data', data => {
                buffer += data.toString();
                const lines = buffer.split('\n'); buffer = lines.pop();
                for (const line of lines) {
                    if (!line.startsWith('DBEXT ')) continue;
                    try {
                        const event = JSON.parse(line.slice(6));
                        if (cancelled) continue;
                        if (event.event === 'result') result = event;
                        if (event.event === 'error') stderr = event.message;
                        onEvent(event);
                    } catch (_) { stderr = 'Invalid response from MFLUX.'; }
                }
            });
            child.on('close', code => {
                if (cancelled) finish(new Error('Cancelled'));
                else if (code !== 0 || !result) finish(new Error(stderr || 'MFLUX exited without a result.'));
                else finish(null, result);
            });
        });
        return {promise, cancel() {
            if (settled || cancelled) return;
            cancelled = true; child.kill('SIGTERM');
            killTimer = setTimeout(() => child.kill('SIGKILL'), 3000); killTimer.unref();
        }};
    }
    async function status() {
        let backend;
        if (!fs.existsSync(python) || !fs.existsSync(runner)) backend = {available:false, error:'MFLUX is not installed. See backend setup in the development guide.'};
        else {
            const probe = job('probe', {});
            const timer = setTimeout(() => probe.cancel(), 10000);
            try {backend = await probe.promise;} catch (error) {backend = {available:false,error:error.message};}
            finally {clearTimeout(timer);}
        }
        return {...backend, models:catalog.map(entry => ({...entry, ...installed(entry)})), installing:(installation && installation.id) || null};
    }
    async function install(id, progress) {
        model(id);
        if (installation || generation) throw new Error('Wait for the active model job to finish.');
        const task = job('install', {id}, progress); installation = {...task,id};
        try { await task.promise; return {...model(id), ...installed(model(id))}; }
        finally {installation = null;}
    }
    async function metadata(id) {
        model(id);
        const cached = infoCache.get(id);
        if (cached && Date.now()-cached.at < 3600000) return cached.value;
        const task = job('metadata', {id});
        const timer = setTimeout(() => task.cancel(), 30000);
        try {const value = await task.promise;infoCache.set(id,{at:Date.now(),value});return value;}
        finally {clearTimeout(timer);}
    }
    function handle(arg) {
        if (arg === 't2im __stop__' && generation) {generation.cancel();return true;}
        if (!arg.startsWith('t2im ') || arg === 't2im __stop__') return false;
        let request;
        try {request = JSON.parse(arg.slice(5));} catch (_) {return false;}
        if (request.engine !== 'mflux') return false;
        if (generation) return true;
        emit('sdbk inwk');
        try {
            const entry = model(request.selected_sd_model);
            if (!installed(entry).asset_path) throw new Error('Download this model from Models first.');
            if (installation) throw new Error('Wait for the model download to finish.');
            generation = job('generate', request, event => {
                if (event.event === 'stage' || event.event === 'progress') emit('sdbk stat ' + JSON.stringify(event));
                if (event.event === 'progress') emit('sdbk dnpr ' + Math.max(0,Math.min(100,event.value)));
            });
            generation.promise.then(result => emit('sdbk nwim ' + JSON.stringify(result)))
                .catch(error => {if (error.message !== 'Cancelled') emit('sdbk errr ' + error.message.replace(/[\r\n]/g,' ').slice(-1200));})
                .finally(() => {generation = null;emit('sdbk inrd');});
        } catch (error) {emit('sdbk errr ' + error.message);emit('sdbk inrd');}
        return true;
    }
    function remove(id) {
        const entry = model(id);
        if (generation || installation) throw new Error('Wait for the active model job to finish.');
        const directory = path.join(modelsDir, entry.id);
        if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('Remove linked models from their original location.');
        fs.rmSync(directory, {recursive:true, force:true});
    }
    return {status, install, metadata, handle, remove, get busy(){return !!generation;},
        cancelInstall(){if (installation) installation.cancel();}, close(){if (generation) generation.cancel();if (installation) installation.cancel();}};
}
module.exports = {createMfluxEngine};
