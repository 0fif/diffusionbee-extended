const path=require('path');
module.exports=async context=>{
    if(process.env.EXTENDED_RELEASE!=='1')return;
    const app=path.join(context.appOutDir,context.packager.appInfo.productFilename+'.app');
    const entitlements=path.resolve(__dirname,'../build/entitlements.mac.plist');
    await require('electron-osx-sign').signAsync({app,identity:'-',platform:'darwin',
        'identity-validation':false,'gatekeeper-assess':false,'pre-auto-entitlements':false,
        timestamp:'none',hardenedRuntime:false,entitlements,'entitlements-inherit':entitlements});
    require('child_process').execFileSync('codesign',['--verify','--deep','--strict',app],{stdio:'inherit'});
    console.log('Verified ad-hoc signature (no Developer ID or notarization).');
};
