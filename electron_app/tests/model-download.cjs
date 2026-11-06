const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),http=require('http'),crypto=require('crypto');
const {downloadModel}=require('../src/model_download.cjs');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'db-download-'));
const body=Buffer.alloc(65536,42),checksum=crypto.createHash('md5').update(body).digest('hex');
const server=http.createServer((req,res)=>{
 if(req.url==='/redirect'){res.writeHead(302,{location:'/ok'});return res.end();}
 if(req.url==='/loop'){res.writeHead(302,{location:'/loop'});return res.end();}
 if(req.url==='/invalid'){res.writeHead(302,{location:'http://['});return res.end();}
 if(req.url==='/missing'){res.writeHead(404);return res.end('missing');}
 res.writeHead(200,{'content-length':body.length});
 if(req.url==='/slow'){res.write(body.subarray(0,64));return;}
 res.end(body);
});
const sockets=new Set();server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const run=(route,expected=checksum,cancel=false)=>new Promise(resolve=>{
  const stop=downloadModel({url:`http://127.0.0.1:${server.address().port}/${route}`,dest:path.join(directory,'model'),checksum:expected,
   progress:()=>{if(cancel)stop();},complete:hash=>resolve({hash}),failed:error=>resolve({error})});
 });
 assert.equal((await run('redirect')).hash,checksum);
 assert((await run('loop')).error.includes('redirect'));
 assert((await run('invalid')).error.includes('Invalid download redirect'));
 assert.equal((await run('ok')).hash,checksum);
 assert.deepEqual(fs.readFileSync(path.join(directory,'model')),body);
 assert((await run('missing')).error.includes('404'));
 assert((await run('ok','wrong')).error.includes('checksum'));
 assert((await run('slow',checksum,true)).error.includes('cancelled'));
 assert.deepEqual(fs.readdirSync(directory),['model']);
 assert.equal((await run('ok')).hash,checksum);
 console.log('PASS: complete download, HTTP/checksum failure, cancellation, cleanup, preservation, retry');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{for(const s of sockets)s.destroy();server.close();fs.rmSync(directory,{recursive:true,force:true});});
