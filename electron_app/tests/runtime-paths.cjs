const assert=require('assert');
const {runtimePaths}=require('../src/runtime_paths.cjs');
const options={project:'/checkout',resources:'/Applications/Extended.app/Contents/Resources',userData:'/Users/example/Library/Application Support/Extended',env:{}};
const packaged=runtimePaths({...options,packaged:true});
assert(packaged.python.startsWith(options.resources));assert(packaged.runner.startsWith(options.resources));assert(packaged.modelsDir.startsWith(options.userData));
for(const value of Object.values(packaged))assert(!value.includes('/checkout'));
const dev=runtimePaths({...options,packaged:false});assert.equal(dev.python,'/checkout/.runtime/mflux-env/bin/python3');
const custom=runtimePaths({...options,packaged:true,env:{MFLUX_PYTHON:'/custom/python',MFLUX_MODEL_DIR:'/external/models'}});assert.equal(custom.python,'/custom/python');assert.equal(custom.modelsDir,'/external/models');
console.log('PASS: packaged engines are relocatable, models are writable, development and explicit overrides preserved');

const previous=process.env.EXTENDED_RELEASE;process.env.EXTENDED_RELEASE='1';
const builder=require('../electron-builder.config.cjs');
assert.equal(builder.mac.identity,null);assert.equal(builder.afterPack,'./scripts/adhoc-sign.cjs','Release must apply and verify its ad-hoc signature');
if(previous===undefined)delete process.env.EXTENDED_RELEASE;else process.env.EXTENDED_RELEASE=previous;

const configs=require('../webpack.config.cjs')('production');
assert.deepEqual(configs.map(c=>c.target),['web','electron-main','electron-preload']);
assert(configs.every(c=>c.output.path.endsWith('/dist_electron/bundled')));
assert.equal(builder.directories.app,'dist_electron/bundled');
assert.equal(builder.directories.output,'dist_electron');
console.log('PASS: direct build preserves separate renderer/main/preload targets and packaged app directory');
