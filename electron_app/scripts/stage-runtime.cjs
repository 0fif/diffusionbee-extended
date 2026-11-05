// Build inputs only: never copy downloaded generation models or user application data.
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const root=path.resolve(__dirname,'../..');
const python=process.env.MFLUX_PYTHON || path.join(root,'.runtime/mflux-env/bin/python');
const info=JSON.parse(execFileSync(python,['-c','import sys,sysconfig,json; print(json.dumps(dict(base=sys.base_prefix,site=sysconfig.get_path("purelib"),version="%s.%s"%sys.version_info[:2])))'],{encoding:'utf8'}));
const destination=path.join(root,'.runtime/release-resources');
const runtime=path.join(destination,'mflux-runtime');
const installed=execFileSync(python,['-m','pip','freeze'],{encoding:'utf8'}).trim();
const locked=fs.readFileSync(path.join(root,'backends/mflux/requirements-release.txt'),'utf8').trim();
if(installed!==locked)throw Error('Python dependencies differ from requirements-release.txt. Recreate the build environment from that lock first.');
const core=process.env.BACKEND_BUILD_PATH || path.join(root,'.runtime/DiffusionBee.app/Contents/Resources/core');
for(const required of [path.join(core,'diffusionbee_backend'),path.join(core,'realesrgan_ncnn_macos')])if(!fs.existsSync(required))throw Error('Missing release build input: '+required);
fs.mkdirSync(destination,{recursive:true});
fs.rmSync(runtime,{recursive:true,force:true});
fs.rmSync(path.join(destination,'core'),{recursive:true,force:true});
const filter=source=>!source.split(path.sep).includes('__pycache__')&&!source.endsWith('.pyc');
fs.cpSync(info.base,runtime,{recursive:true,filter,verbatimSymlinks:true});
fs.cpSync(info.site,path.join(runtime,'lib','python'+info.version,'site-packages'),{recursive:true,filter,verbatimSymlinks:true});
fs.cpSync(core,path.join(destination,'core'),{recursive:true,filter,verbatimSymlinks:true});
const metadata=JSON.parse(execFileSync(process.execPath,['-e',`const asar=require('asar');process.stdout.write(asar.extractFile(process.argv[1],'package.json'));`,path.join(path.dirname(core),'app.asar')],{cwd:path.join(root,'electron_app'),encoding:'utf8'}));
fs.writeFileSync(path.join(destination,'legacy-backend.json'),JSON.stringify({version:metadata.version,build_number:metadata.build_number},null,2));
function checkLinks(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isSymbolicLink()){const target=fs.realpathSync(file);if(!target.startsWith(fs.realpathSync(destination)+path.sep))throw Error('External runtime link: '+file);}else if(entry.isDirectory())checkLinks(file);}}
checkLinks(destination);
execFileSync(path.join(runtime,'bin/python3'),['-u',path.join(root,'backends/mflux/runner.py'),'probe'],{cwd:'/private/tmp',input:'{}',stdio:['pipe','inherit','inherit'],env:{...process.env,PYTHONNOUSERSITE:'1',PYTHONDONTWRITEBYTECODE:'1'}});
const sha=file=>require('crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');
fs.writeFileSync(path.join(destination,'runtime-provenance.json'),JSON.stringify({python:info.version,mflux:'0.24.0',legacy:metadata.version,legacyBackendSha256:sha(path.join(core,'diffusionbee_backend')),requirementsSha256:sha(path.join(root,'backends/mflux/requirements-release.txt'))},null,2));
console.log('Staged portable runtimes at '+destination);
