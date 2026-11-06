const fs = require('fs');
const path = require('path');
const {spawn} = require('child_process');
const {randomUUID} = require('crypto');
const {fileURLToPath} = require('url');
let active;

function runUpscale(input, binary, outputDir) {
    if (active) return Promise.reject(Error('An upscale is already running.'));
    return new Promise((resolve, reject) => {
        const source = input.startsWith('file:') ? fileURLToPath(input) : input;
        if (!fs.existsSync(source)) throw new Error('The input image could not be found.');
        fs.mkdirSync(outputDir, {recursive:true});
        const output = path.join(outputDir, 'upscale-' + randomUUID() + '.png');
        const child = spawn(binary, ['-m', path.join(path.dirname(binary), 'models'), '-n', 'realesrgan-x4plus', '-s', '4', '-i', source, '-o', output]);
        const job = active = {child, cancelled:false, timer:null};
        let errorText = '', settled = false;
        const finish = error => {
            if (settled) return;
            settled = true; clearTimeout(job.timer); active = null;
            if (error) {fs.rmSync(output, {force:true});reject(error);} else resolve(output);
        };
        child.stderr.on('data', data => {errorText = (errorText + data).slice(-2000);});
        child.stdout.resume();
        child.once('error', finish);
        child.once('close', code => {
            if (job.cancelled) finish(Error('Upscaling cancelled.'));
            else if (code === 0 && fs.existsSync(output) && fs.statSync(output).size > 0) finish();
            else finish(Error('Upscaling failed.' + (errorText ? ' ' + errorText.trim().slice(-500) : ' The upscaler did not produce an image.')));
        });
    });
}
function cancel(force = false) {
    if (!active || (active.cancelled && !force)) return;
    clearTimeout(active.timer);
    const job = active; job.cancelled = true; job.child.kill(force ? 'SIGKILL' : 'SIGTERM');
    if (force) return;
    job.timer = setTimeout(() => job.child.kill('SIGKILL'), 3000);job.timer.unref();
}
module.exports = {runUpscale, cancel, get busy() {return !!active;}};
