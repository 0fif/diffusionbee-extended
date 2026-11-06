const assert = require('assert');
const fs = require('fs'), path = require('path'), os = require('os');
const {parse} = require('@vue/compiler-sfc');
const {convertModel} = require('../src/convert_model.cjs');
const {createLegacyEngine} = require('../src/legacy_engine.cjs');
const upscaler = require('../src/upscale.cjs');
const root = path.resolve(__dirname, '../src');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'db-audit-'));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const script = file => parse(read(file)).descriptor.script.content.replace(/^import .*$/gm, '');
const executable = (name, source) => {const filename=path.join(directory,name);fs.writeFileSync(filename,`#!${process.execPath}\n${source}`);fs.chmodSync(filename,0o755);return filename;};
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
(async () => {
    const source = path.join(directory,'original.ckpt');fs.writeFileSync(source,'user weights');
    const options = {source,name:'test',directory:path.join(directory,'models')};
    await assert.rejects(convertModel({...options,binary:path.join(directory,'missing')}), /ENOENT/);
    assert.equal(fs.readFileSync(source,'utf8'),'user weights','Failed import keeps the original checkpoint');
    const broken = executable('broken', "require('fs').writeFileSync(process.argv.at(-1),'partial');process.stdout.write('__converted_model_data__bad-json');");
    await assert.rejects(convertModel({...options,binary:broken}), /JSON|Unexpected/);
    assert.deepEqual(fs.readdirSync(options.directory),[],'Malformed converter metadata cannot register partial output');
    const good = executable('good', "require('fs').writeFileSync(process.argv.at(-1),'weights');process.stdout.write('__converted_model_data__'+JSON.stringify({sd_type:'SD_1x'}));");
    const result = await convertModel({...options,binary:good});assert(result.success);assert.equal(result.metadata.sd_type,'SD_1x');assert(fs.existsSync(source));
    const old = result.model_path;
    const second = await convertModel({...options,binary:good});assert.notEqual(old,second.model_path);assert(fs.existsSync(old),'Another import cannot overwrite existing weights');

    let errors=[];const lines=[];
    const missing=createLegacyEngine({binary:path.join(directory,'missing'),line:v=>lines.push(v),log:()=>{},failed:e=>errors.push(e)});
    missing.start();await sleep(100);assert.equal(errors.length,1);assert.equal(missing.write('strt'),false);
    errors=[];
    const worker=executable('worker',"process.stdout.write('sdbk m');setTimeout(()=>{process.stdout.write('dld\\nsdbk inrd\\n');process.stderr.write('fixture failure');process.exit(2);},30);");
    const engine=createLegacyEngine({binary:worker,line:v=>lines.push(v),log:()=>{},failed:e=>errors.push(e)});
    engine.start();await sleep(200);assert.deepEqual(lines,['sdbk mdld','sdbk inrd']);assert.equal(errors.length,1);assert(errors[0].includes('fixture failure'));
    errors=[];
    const slow=executable('slow',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000);");
    const closed=createLegacyEngine({binary:slow,line:()=>{},log:()=>{},failed:e=>errors.push(e)});
    closed.start();await sleep(100);closed.close();await sleep(100);assert.deepEqual(errors,[],'Intentional shutdown is not a crash');

    const converting = convertModel({...options, binary:slow});
    const conversionStopped = assert.rejects(converting);
    await sleep(50);require('../src/convert_model.cjs').close();await conversionStopped;
    assert(fs.existsSync(source),'Quitting during conversion preserves the source');

    const image=path.join(directory,'input.png');fs.writeFileSync(image,'image');
    const job=upscaler.runUpscale(image,slow,path.join(directory,'outputs'));
    const rejection=assert.rejects(job,/cancelled/);assert(upscaler.busy);
    await assert.rejects(upscaler.runUpscale(image,slow,directory),/already running/);
    await sleep(100);upscaler.cancel();upscaler.cancel(true);await rejection;assert(!upscaler.busy,'Cancellation releases the worker');

    const utils=read('utils.js').replace(/export \{[^}]+\}/,'');
    const storage={'migration_data.json':{},'data.json':{history:{old:{imgs:['/fixture/image.png'],img_w:64,img_h:48,prompt:'saved prompt',seed:1}}}};
    let failSave=true;
    const window={ipcRenderer:{sendSync:(channel,value,name)=>{
        if(channel==='load_data')return JSON.parse(JSON.stringify(storage[value] || {}));
        if(failSave&&name==='history.json')return false;
        storage[name]=value;return true;
    }}};
    const migrate=new Function('window',utils+';return migrate_history_only_once;')(window);
    assert.throws(()=>migrate({}),/Migration will retry/);assert(!storage['migration_data.json'].is_history_migrated);
    failSave=false;migrate({});assert(storage['history.json'].history.old);assert(storage['migration_data.json'].is_history_migrated);
    assert.deepEqual(migrate(storage['history.json'].history),{});

    const Form=new Function('ResolveInputComponent',script('components_bare/Form.vue').replace('export default','return'))({});
    const values={seed:'',flag:true,count:5};
    const fields=[{id:'seed',output_type:'int',default_value:0},{id:'flag',default_value:false},{id:'count',output_type:'int',default_value:1}];
    const form={form_values:values,form_data:fields,filtered_form_data:fields};
    for(const [key,method] of Object.entries(Form.methods))form[key]=method.bind(form);
    assert.equal(form.post_processed_form_outputs().seed,'','Empty seed is random, not numeric zero');
    form.reset_to_default();assert.equal(values.seed,0);assert.equal(values.flag,false);assert.equal(values.count,1);
    const prep=new Function(script('components/BasicSDApplet.vue').split('export default')[0]+';return prep_sd_options;')();
    assert.equal(prep({seed:0}).seed,0);assert(Number.isInteger(prep({seed:''}).seed));

    const Manager=new Function(script('SDManager.vue').replace('export default','return'))();
    let group;
    Manager.methods.add_job.call({add_job_group:g=>{group=g;}},{seed:0,num_imgs:2},{},{});
    assert.equal(group.jobs[0].seed,0);assert.equal(group.jobs[1].seed,1234);
    Manager.methods.stop_all.call({stable_diffusion:{pending_result:Promise.resolve()}}); // Must not mutate the finishing group.

    const native = read('native_functions.js');
    const handlers = {};
    const dataDirectory = path.join(directory, 'data');fs.mkdirSync(dataDirectory);
    new Function('ipcMain','require','process',native.slice(native.indexOf('function save_json('),native.indexOf("ipcMain.on('delete_file'")))(
        {on:(name,fn)=>{handlers[name]=fn;}},require,{env:{DIFFUSIONBEE_DATA_DIR:dataDirectory}});
    fs.writeFileSync(path.join(dataDirectory,'history.json'),'damaged original');
    const response = {};handlers.save_data(response,{history:{}},'history.json');assert.equal(response.returnValue,true);
    const backup=fs.readdirSync(dataDirectory).find(name=>name.startsWith('history.json.corrupt-'));
    assert(backup);assert.equal(fs.readFileSync(path.join(dataDirectory,backup),'utf8'),'damaged original');
    let saveImage;
    new Function('ipcMain','require','path','process','Buffer',native.slice(native.indexOf("ipcMain.on('save_b64_image'"),native.indexOf('function save_json(')))(
        {on:(_,fn)=>{saveImage=fn;}},require,path,{env:{DIFFUSIONBEE_DATA_DIR:path.join(source,'not-a-folder')}},Buffer);
    saveImage(response,'data:image/png;base64,eA==',false);assert.equal(response.returnValue,null,'Disk failure always replies to synchronous image IPC');

    const imageUtils=new Function(read('utils/image_export.js').replace(/export /g,'')+';return {image_source_url};')();
    assert.equal(imageUtils.image_source_url('/photo #?%.png'),'file:///photo%20%23%3F%25.png');
    const menus=new Function('export_image','image_export_format',read('components/image_menu_functions.js').replace(/^import .*$/gm,'').replace(/export \{[^}]+\}/,'')+';return image_manu_functions;')(()=>{},()=>{});
    assert(!menus.send_outpaint,'A gallery action cannot point to a nonexistent tool');
    console.log('PASS: failed/successful imports, existing-file protection, real process failures and shutdown, forced upscale cancellation, migration write failure/retry, blank and zero seed, false defaults, finishing guard, special file paths, dead action removal');
})().catch(error=>{console.error(error);process.exitCode=1;});
