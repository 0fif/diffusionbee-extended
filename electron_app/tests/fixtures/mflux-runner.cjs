let input='';process.stdin.on('data',data=>input+=data);process.stdin.on('end',()=>{
 const options=JSON.parse(input);const send=event=>process.stdout.write('DBEXT '+JSON.stringify(event)+'\n');
 if(process.argv[2]==='probe'){send({event:'result',available:true});return;}
 if(process.argv[2]==='install'){
   send({event:'download',completed_files:0,total_files:1,transferred_bytes:4});
   setTimeout(()=>{const fs=require('fs'),path=require('path');const dir=path.join(options.models_dir,options.id);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'weights'),'fixture');fs.writeFileSync(path.join(dir,'.installed.json'),JSON.stringify({repo:'test/image',files:{weights:7},bytes:7}));send({event:'result',installed:true});},200);
   return;
 }
 if(options.prompt==='fail'){send({event:'error',message:'fixture failed'});process.exitCode=1;return;}
 if(options.prompt==='slow'){setTimeout(()=>send({event:'result',generated_img_path:'late.png'}),5000);return;}
 if(options.prompt==='stubborn'){process.on('SIGTERM',()=>{});send({event:'stage',message:'Ready to cancel'});setTimeout(()=>send({event:'result',generated_img_path:'late.png'}),10000);return;}
 // Exercise split stdout chunks, not just whole lines.
 process.stdout.write('DB');setTimeout(()=>{process.stdout.write('EXT '+JSON.stringify({event:'progress',value:50})+'\n');send({event:'result',generated_img_path:'test.png'});},10);
});
