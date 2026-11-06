const fs = require('fs');
const path = require('path');
const {spawn} = require('child_process');
const webpack = require('webpack');
const root = path.resolve(__dirname,'..');
process.chdir(root);
const command = process.argv[2];
const mode = command === 'serve' ? 'development' : 'production';
const output = path.join(root,'dist_electron/bundled');
function run(binary,args,env=process.env) {
    return new Promise((resolve,reject) => {
        const child=spawn(binary,args,{cwd:root,stdio:'inherit',env});
        child.on('error',reject);
        child.on('exit',code=>code===0?resolve():reject(Error('Process exited: '+code)));
    });
}
(async()=>{
    fs.rmSync(output,{recursive:true,force:true});
    const compiler=webpack(require('../webpack.config.cjs')(mode));
    await new Promise((resolve,reject)=>compiler.run((error,stats)=>{
        compiler.close(closeError=>{
            if(error||closeError)return reject(error||closeError);
            console.log(stats.toString({all:false,errors:true,warnings:true,timings:true}));
            stats.hasErrors()?reject(Error('Build failed')):resolve();
        });
    }));
    fs.copyFileSync('public/favicon.ico',path.join(output,'favicon.ico'));
    const pkg=require('../package.json');
    const dependencies=Object.fromEntries(['electron-context-menu','electron-localshortcut'].map(name=>[name,pkg.dependencies[name]]));
    fs.writeFileSync(path.join(output,'package.json'),JSON.stringify({name:pkg.name,version:pkg.version,description:pkg.description,main:'background.js',dependencies},null,2));
    if(command==='package')await run(process.execPath,[require.resolve('electron-builder/cli.js'),'--config','electron-builder.config.cjs',...process.argv.slice(3)]);
    else if(command==='serve')await run(require('electron'),[output],{...process.env,NODE_ENV:'development'});
})().catch(error=>{console.error(error);process.exitCode=1;});
