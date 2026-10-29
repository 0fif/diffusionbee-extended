const assert=require('assert');const fs=require('fs');const path=require('path');const os=require('os');
const {createMfluxEngine}=require('../src/mflux_engine.cjs');
(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'db-mflux-test-'));
 const missing=createMfluxEngine({runner:path.join(directory,'missing/runner.py'),python:path.join(directory,'missing/python'),modelsDir:directory,outputDir:directory,emit:()=>{}});
 assert.equal((await missing.status()).available,false,'missing optional backend must not prevent legacy startup');
 const runner=path.join(directory,'runner.cjs');fs.copyFileSync(path.join(__dirname,'fixtures/mflux-runner.cjs'),runner);
 const catalog=[{id:'image-model',repo:'test/image',model_meta_data:{engine:'mflux'}}];fs.writeFileSync(path.join(directory,'models.json'),JSON.stringify(catalog));
 const modelDir=path.join(directory,'image-model');fs.mkdirSync(modelDir);fs.writeFileSync(path.join(modelDir,'weights'),'fixture');
 fs.writeFileSync(path.join(modelDir,'.installed.json'),JSON.stringify({repo:'test/image',files:{weights:7},bytes:7}));
 let events=[];
 const engine=createMfluxEngine({runner,python:process.execPath,modelsDir:directory,outputDir:directory,emit:event=>events.push(event),
   spawnProcess:(python,args,options)=>require('child_process').spawn(python,args.filter(a=>a!=='-u'),options)});
 const wait=async()=>{for(let n=0;engine.busy&&n<100;n++)await new Promise(resolve=>setTimeout(resolve,25));assert(!engine.busy,'job finishes');};
 const submit=prompt=>engine.handle('t2im '+JSON.stringify({engine:'mflux',selected_sd_model:'image-model',prompt}));
 assert.equal(engine.handle('t2im {"prompt":"legacy"}'),false);
 submit('test');await wait();assert(events.some(e=>e.startsWith('sdbk nwim ')));assert(events.includes('sdbk dnpr 50'));assert.equal(events.at(-1),'sdbk inrd');
 events=[];submit('fail');await wait();assert(events.some(e=>e.includes('fixture failed')));assert.equal(events.at(-1),'sdbk inrd');
 events=[];submit('slow');assert(engine.handle('t2im __stop__'));await wait();assert(!events.some(e=>e.startsWith('sdbk nwim')));assert.equal(events.at(-1),'sdbk inrd');
 events=[];engine.handle('t2im '+JSON.stringify({engine:'mflux',selected_sd_model:'chat-model'}));assert(events.some(e=>e.includes('not supported')));
 fs.unlinkSync(path.join(modelDir,'weights'));events=[];submit('test');assert(events.some(e=>e.includes('Download this model')));
 engine.close();fs.rmSync(directory,{recursive:true,force:true});console.log('PASS: modern/legacy routing, chunked events, failures, cancellation, missing weights, unsupported models');
})().catch(error=>{console.error(error);process.exitCode=1});
