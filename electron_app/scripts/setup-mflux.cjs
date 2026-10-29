const path=require('path');
const {spawnSync}=require('child_process');
const root=path.resolve(__dirname,'../..');
const python=process.env.MFLUX_SETUP_PYTHON || 'python3';
function run(executable,args){const result=spawnSync(executable,args,{cwd:root,stdio:'inherit'});if(result.error){console.error(result.error.message);process.exit(1);}if(result.status!==0)process.exit(result.status||1);}
run(python,['-c','import sys; assert sys.version_info >= (3,11), "MFLUX requires Python 3.11+. Set MFLUX_SETUP_PYTHON to that executable."']);
const environment=path.join(root,'.runtime/mflux-env');
run(python,['-m','venv',environment]);
run(path.join(environment,'bin/python'),['-m','pip','install','-r',path.join(root,'backends/mflux/requirements.txt')]);
console.log('MFLUX installed. Restart Extended, then download an image model from Models → Discover.');
