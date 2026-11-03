const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'../src');
const source=fs.readFileSync(path.join(root,'utils/model_details.js'),'utf8').replace(/^import .*$/gm,'').replace(/export /g,'');
const compat=fs.readFileSync(path.join(root,'utils/model_compatibility.js'),'utf8').replace(/export \{[^}]+\};/,'return model_available;');
const available=new Function(compat)();
const details=new Function('validation','model_available',source+';return {task_checks,architecture_name,tool_models,model_tasks};')(require('../src/data/model_validation.json'),available);
const catalog=require('../../backends/mflux/models.json');
assert.equal(details.task_checks(catalog[0],{mflux:true})[0].status,'Tested');
assert.equal(details.task_checks({...catalog[0],revision:'different'},{mflux:true})[0].status,'Untested');
assert.equal(details.task_checks(catalog[0],{mflux:false})[0].status,'Needs engine');
assert(details.task_checks({id:'unverified',model_meta_data:{type:'sd_model'}},{}).every(c=>c.status==='Untested'));
const flux={id:'FLUX.1-schnell',min_version:40,model_meta_data:{type:'flux_nnc',sd_type:'flux_schnell'}};
assert.equal(details.task_checks(flux,{build:40,modern_models:true})[1].status,'Unsupported');
assert.equal(details.architecture_name(catalog[0]),'FLUX.2 Klein 4B · 4-bit');
assert.equal(details.task_checks(flux,{build:29})[0].status,'Needs engine');
console.log('PASS: task-specific evidence, unsupported tasks, missing engines, unverified checkpoints, architecture labels');

assert.deepEqual(details.model_tasks({model_meta_data:{type:'unknown'}}),[]);
const assets={klein:catalog[0],flux,limited:{id:'limited',model_meta_data:{type:'sd_model',tasks:['txt2img']}}};
assert(!details.tool_models(assets,{mflux:false,build:29},'txt2img').some(m=>m.id===catalog[0].id||m.id===flux.id));
assert(details.tool_models(assets,{mflux:true,build:40,modern_models:true},'txt2img').some(m=>m.id===flux.id));
assert(!details.tool_models(assets,{mflux:true,build:40,modern_models:true},'inpainting').some(m=>m.id===flux.id||m.id==='limited'));
for(const task of ['txt2img','img2img','inpainting']) for(const m of details.tool_models(assets,{mflux:true},task)) assert(details.model_tasks(m).includes(task));
console.log('PASS: catalog and tool eligibility agree, unknown types excluded, task restrictions respected');

for(const task of ['txt2img','img2img','inpainting']) assert.deepEqual(details.tool_models({}, {mflux:true,build:40,modern_models:true}, task), [], 'Removing all models must leave zero choices');
