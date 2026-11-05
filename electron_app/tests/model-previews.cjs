const assert=require('assert');
const {extractImages,createPreviewResolver,cardLocation}=require('../src/model_previews.cjs');
const body=text=>({body:Buffer.from(text),type:'text/plain'});
const img={body:Buffer.from('image'),type:'image/png'};
(async()=>{
 assert.deepEqual(extractImages('![badge](badge.png)\n![pareto](chart.png)\n```\n![fake](fake.png)\n```\n<img src="./sample.png">','https://huggingface.co/a/b/resolve/main/'),['https://huggingface.co/a/b/resolve/main/sample.png']);
 assert.deepEqual(extractImages('## FLUX.2 [klein]\n![examples](assets/klein.jpg)\n## FLUX.2 [dev]\n![examples](assets/dev.jpg)','https://raw.githubusercontent.com/a/b/main/','flux2-klein'),['https://raw.githubusercontent.com/a/b/main/assets/klein.jpg']);
 let calls=0;
 const resolver=createPreviewResolver(async url=>{calls++;if(url.includes('broken'))throw Error('HTTP 404');if(url.endsWith('.png'))return img;if(url.includes('converted'))return body('---\nbase_model: author/original\n---\n');return body('![sample](./sample.png)');});
 const model={id:'test',repo:'author/converted',img_url:'https://image.civitai.com/broken.png'};
 const result=await resolver(model);assert.equal(result.status,'ready');assert.equal(result.source,'https://huggingface.co/author/original');assert(result.image.startsWith('data:image/png;base64,'));
 const count=calls;await resolver(model);assert.equal(calls,count);await resolver(model,true);assert(calls>count);
 assert.equal((await createPreviewResolver(async()=>body('![pareto](chart.png)'))({repo:'a/b'})).status,'empty');
 assert.equal((await createPreviewResolver(async()=>{throw Error('HTTP 401');})({repo:'a/b'})).status,'error');
 assert.equal((await resolver({id:'local'})).status,'unknown');
 console.log('PASS: relative images, badge/chart exclusion, family sections, base-model lookup, broken-link fallback, caching, refresh, empty/error/unknown states');
})().catch(e=>{console.error(e);process.exit(1);});

(async()=>{
 const {createMetadataResolver}=require('../src/model_previews.cjs');
 const hf=createMetadataResolver(async()=>body(JSON.stringify({id:'a/b',downloads:0,likes:0,lastModified:'2026-01-01',cardData:{license:'apache-2.0'},siblings:[{rfilename:'one.bin',size:100},{rfilename:'two.bin',size:200}]})));
 const result=await hf({repo:'a/b',url:'https://huggingface.co/a/b/resolve/main/one.bin'});
 assert.equal(result.downloads,0);assert.equal(result.bytes,100);assert.equal(result.repository_bytes,300);
 const civitai=createMetadataResolver(async()=>body(JSON.stringify({name:'Checkpoint',stats:{downloadCount:123,thumbsUpCount:4},creator:{username:'Author'},modelVersions:[{id:1,baseModel:'SD 1.5'},{id:2,baseModel:'SDXL'}]})));
 const current=await civitai({source_page_url:'https://civitai.com/models/123'});
 assert.equal(current.architecture,undefined,'Do not borrow architecture from a different version');
 assert.equal(current.downloads_label,'Downloads · all versions');
 assert.equal((await civitai({source_page_url:'https://civitai.com/models/123?modelVersionId=1'})).architecture,'SD 1.5');
 console.log('PASS: source statistics including zero, exact file vs repository size, version-scoped architecture');
})().catch(e=>{console.error(e);process.exit(1);});

(async()=>{
 const {createDownloadSizeResolver}=require('../src/model_previews.cjs');let requested;
 const size=createDownloadSizeResolver(async url=>{requested=url;return 123;},async url=>{requested=url;return body(JSON.stringify({siblings:[{rfilename:'model.safetensors',size:200},{rfilename:'config.json',size:10},{rfilename:'README.md',size:5},{rfilename:'fonts/example.ttf',size:20},{rfilename:'fonts/example.otf',size:30},{rfilename:'preview.png',size:999}]}));});
 assert.equal(await size({url:'https://models.diffusionbee.com/model'}),123);
 assert.equal(await size({repo:'a/b',revision:'abc',engine:'mflux'}),265);
 assert(requested.includes('/revision/abc?blobs=true'));
 console.log('PASS: actual download URL size, pinned MFLUX revision and installer file selection');
})().catch(e=>{console.error(e);process.exit(1);});

assert.deepEqual(cardLocation('https://github.com/mflux-community/mflux/blob/main/src/mflux/models/fibo2/README.md'), {raw:'https://raw.githubusercontent.com/mflux-community/mflux/main/src/mflux/models/fibo2/README.md',base:'https://raw.githubusercontent.com/mflux-community/mflux/main/src/mflux/models/fibo2/',section:''});
