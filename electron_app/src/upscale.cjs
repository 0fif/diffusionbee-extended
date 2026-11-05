const fs = require('fs');
const path = require('path');
const {spawn} = require('child_process');
const {randomUUID} = require('crypto');
const {fileURLToPath} = require('url');

function runUpscale(input, binary, outputDir) {
    return new Promise((resolve, reject) => {
        const source = input.startsWith('file:') ? fileURLToPath(input) : input;
        if (!fs.existsSync(source)) throw new Error('The input image could not be found.');
        fs.mkdirSync(outputDir, {recursive:true});
        const output = path.join(outputDir, 'upscale-' + randomUUID() + '.png');
        const child = spawn(binary, ['-m', path.join(path.dirname(binary), 'models'), '-n', 'realesrgan-x4plus', '-s', '4', '-i', source, '-o', output]);
        let errorText = '';
        child.stderr.on('data', data => {errorText = (errorText + data).slice(-2000);});
        child.stdout.resume();
        child.once('error', reject);
        child.once('close', code => {
            if (code === 0 && fs.existsSync(output) && fs.statSync(output).size > 0) resolve(output);
            else {
                if (fs.existsSync(output)) fs.unlinkSync(output);
                reject(new Error('Upscaling failed.' + (errorText ? ' ' + errorText.trim().slice(-500) : ' The upscaler did not produce an image.')));
            }
        });
    });
}
module.exports = {runUpscale};
