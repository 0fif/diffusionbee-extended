const fs = require('fs');
const path = require('path');
const {execFile} = require('child_process');
const {promisify} = require('util');
const {randomUUID} = require('crypto');
const active = new Map();

async function convertModel({binary, args = [], source, name, directory, cleanup = {}}) {
    fs.mkdirSync(directory, {recursive:true});
    const output = path.join(directory, name.replace(/[\\/]/g, '_') + '-' + randomUUID() + '.tdict');
    let task;
    try {
        task = promisify(execFile)(binary, [...args, 'convert_model', source, output], {maxBuffer:4 * 1024 * 1024});
        active.set(task.child, output);
        const {stdout} = await task;
        if (!fs.existsSync(output) || !fs.statSync(output).size) throw Error('The converter did not produce model weights.');
        const line = stdout.split('\n').find(line => line.startsWith('__converted_model_data__'));
        const metadata = line ? JSON.parse(line.slice('__converted_model_data__'.length)) : {};
        if (cleanup.delete_origional_on_success || cleanup.delete_origional_always) fs.rmSync(source, {force:true});
        return {success:true, model_path:output, metadata};
    } catch (error) {
        fs.rmSync(output, {force:true});
        if (cleanup.delete_origional_always) fs.rmSync(source, {force:true});
        throw error;
    } finally { if (task) active.delete(task.child); }
}
function close() {
    for (const [child, output] of active) {child.kill('SIGKILL');fs.rmSync(output, {force:true});}
}
module.exports = {convertModel, close};
