const path=require('path');
module.exports=async context=>{
    if(process.env.EXTENDED_RELEASE!=='1')return;
    const app=path.join(context.appOutDir,context.packager.appInfo.productFilename+'.app');
    const entitlements=path.resolve(__dirname,'../build/entitlements.mac.plist');
    const {sign} = await import('@electron/osx-sign');
    await sign({app,identity:'-',platform:'darwin',identityValidation:false,
        preAutoEntitlements:false,preEmbedProvisioningProfile:false,
        optionsForFile:()=>({entitlements,hardenedRuntime:false,timestamp:'none'})});
    require('child_process').execFileSync('codesign',['--verify','--deep','--strict',app],{stdio:'inherit'});
    console.log('Verified ad-hoc signature (no Developer ID or notarization).');
};
