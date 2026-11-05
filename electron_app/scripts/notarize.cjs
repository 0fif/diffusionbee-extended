const path=require('path');
module.exports=async context=>{
    if(process.env.EXTENDED_RELEASE!=='1')return;
    if(!process.env.APPLE_KEYCHAIN_PROFILE)throw Error('APPLE_KEYCHAIN_PROFILE is required for release notarization.');
    const appPath=path.join(context.appOutDir,context.packager.appInfo.productFilename+'.app');
    await require('electron-notarize').notarize({tool:'notarytool',appPath,keychainProfile:process.env.APPLE_KEYCHAIN_PROFILE});
    require('child_process').execFileSync('xcrun',['stapler','validate',appPath],{stdio:'inherit'});
};
