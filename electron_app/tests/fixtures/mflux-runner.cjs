let input='';process.stdin.on('data',data=>input+=data);process.stdin.on('end',()=>{
 const options=JSON.parse(input);const send=event=>process.stdout.write('DBEXT '+JSON.stringify(event)+'\n');
 if(options.prompt==='fail'){send({event:'error',message:'fixture failed'});process.exitCode=1;return;}
 if(options.prompt==='slow'){setTimeout(()=>send({event:'result',generated_img_path:'late.png'}),5000);return;}
 // Exercise split stdout chunks, not just whole lines.
 process.stdout.write('DB');setTimeout(()=>{process.stdout.write('EXT '+JSON.stringify({event:'progress',value:50})+'\n');send({event:'result',generated_img_path:'test.png'});},10);
});
