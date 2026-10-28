// Use an official local app bundle; never download or redistribute its binaries.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const appPath = path.resolve(process.env.DIFFUSIONBEE_APP || path.join(__dirname, '../../.runtime/DiffusionBee.app'));
const core = path.join(appPath, 'Contents/Resources/core');
const backend = path.join(core, 'diffusionbee_backend');
if (!fs.existsSync(backend)) {
  console.error('Backend not found. Set DIFFUSIONBEE_APP to your DiffusionBee.app path. See electron_app/README.md.');
  process.exit(1);
}
console.log('Using release backend: ' + backend);
const child = spawn('npm', ['run', 'electron:serve', '--', ...process.argv.slice(2)], {
  cwd: path.join(__dirname, '..'), stdio: 'inherit',
  env: { ...process.env, BIN_PATH: backend, REALESRGAN_BIN: path.join(core, 'realesrgan_ncnn_macos') }
});
child.on('error', err => { console.error(err.message); process.exit(1); });
child.on('exit', code => process.exit(code === null ? 1 : code));
