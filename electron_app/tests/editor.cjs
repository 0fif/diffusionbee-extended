// Uses the app's own Electron, Vue and browser canvas; no test dependencies.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'diffusionbee-editor-'));
app.setPath('userData', profile);
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 900, height: 650, show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false, webSecurity: false } });
  try {
    await win.loadURL('about:blank');
    const result = await win.webContents.executeJavaScript(`(${run.toString()})(${JSON.stringify(path.resolve(__dirname, '..'))})`);
    console.log(result);
    fs.writeFileSync(path.join(profile, 'editor.png'), (await win.webContents.capturePage()).toPNG());
    console.log('Canvas screenshot: ' + path.join(profile, 'editor.png'));
    app.exit(0);
  } catch (err) {
    console.error(err);
    app.exit(1);
  }
});
setTimeout(() => { console.error('Editor checks timed out'); app.exit(1); }, 20000);

async function run(root) {
  const assert = require('assert');
  const fs = require('fs');
  const path = require('path');
  const Vue = require(path.join(root, 'node_modules/vue/dist/vue.common.js'));
  const compiler = require(path.join(root, 'node_modules/vue-template-compiler'));
  const source = compiler.parseComponent(fs.readFileSync(path.join(root, 'src/components_bare/ImageCanvas.vue'), 'utf8'));
  const component = new Function(source.script.content.replace('export default', 'return'))();
  component.template = source.template.content;
  const fixture = document.createElement('canvas');
  fixture.width = 800; fixture.height = 400;
  fixture.getContext('2d').fillRect(0, 0, 800, 400);
  const file = path.join(require('os').tmpdir(), 'diffusionbee editor # fixture.png');
  fs.writeFileSync(file, Buffer.from(fixture.toDataURL().split(',')[1], 'base64'));
  document.body.innerHTML = '<h2>DiffusionBee Extended: canvas regression checks</h2><div id="host" style="width:400px;height:200px"><div id="mount"></div></div>';
  const vm = new Vue({ render: h => h(component, { ref: 'canvas', props: {
    image_source: file, canvas_id: 'mask', canvas_d_id: 'image', is_inpaint: true, stroke_size_no: '30'
  } }) }).$mount('#mount');
  const editor = vm.$refs.canvas;
  await editor.image_loaded;
  assert(editor.is_ready, 'image with spaces and # loads');
  assert.deepStrictEqual(editor.get_size(), {width: 800, height: 400});
  const rect = editor.canvas.getBoundingClientRect();
  const event = (type, x, y, buttons = 1) => editor.canvas.dispatchEvent(new MouseEvent(type, {
    clientX: rect.left + x, clientY: rect.top + y, button: 0, buttons
  }));
  const alpha = (x, y) => editor.ctx.getImageData(x, y, 1, 1).data[3];
  event('mousedown', 100, 50);
  event('mouseup', 100, 50, 0);
  assert(alpha(200, 100) > 0, 'click paints under cursor at 2x image scale');
  assert.equal(alpha(100, 50), 0, 'no stray dot in screen coordinates');
  assert(editor.is_something_drawn, 'single click counts as a mask');
  event('mousedown', 100, 50);
  event('mousemove', 300, 50);
  event('mouseup', 300, 50, 0);
  for (let x = 200; x <= 600; x++) assert(alpha(x, 100), 'fast stroke must be continuous');
  const mask = editor.get_mask_for_cache();
  editor.invert_inpaint();
  assert.equal(alpha(200, 100), 0);
  assert.equal(alpha(50, 50), 255);
  editor.invert_inpaint();
  assert.equal(alpha(200, 100), 255);
  assert.equal(alpha(50, 50), 0);
  editor.clear_inpaint();
  assert(!editor.is_something_drawn);
  await editor.restore_mask(mask);
  assert(alpha(200, 100), 'cached mask restored');
  assert(editor.is_something_drawn);
  // Reloading the image used to erase a mask restored by a 150ms timer.
  editor.on_img_change();
  await editor.restore_mask(mask);
  assert(alpha(200, 100), 'restore waits for image initialization');
  event('mousedown', 10, 10);
  event('mousemove', 20, 20, 0);
  assert(!editor.flag, 'release outside the window stops drawing');
  assert.equal(editor.canvas.width, 800, 'export retains native resolution');

  const pageSource = compiler.parseComponent(fs.readFileSync(path.join(root, 'src/pages/Inpainting.vue'), 'utf8'));
  const basic = { template: '<div><slot name="input_buttons"/><slot name="output_workpace"/></div>',
    methods: { check_input_form_n_show_error: () => true, get_sd_form_outputs: () => ({}) } };
  const page = new Function('require', 'ImageCanvas', 'BasicSDApplet', 'LoaderModal',
    'find_in_form_recursive', 'inpaint_assets', 'prep_sd_optins',
    pageSource.script.content.replace(/^import .*$/gm, '').replace('export default Inpainting;', 'return Inpainting;'))(
      p => require(path.resolve(root, 'src/pages', p)), component, basic, {template: '<div/>'},
      () => ({}), () => [], () => {});
  page.template = pageSource.template.content;
  const messages = [];
  let callbacks;
  let jobs = 0;
  const backend = {is_input_avail: true, text_to_img: (options, cb) => {callbacks = cb; jobs++;}};
  const app = {stable_diffusion: backend, functions: {}, show_toast: msg => messages.push(msg)};
  window.ipcRenderer = {sendSync: () => file};
  vm.$destroy();
  document.body.innerHTML = '<div id="page"></div>';
  const host = new Vue({ render: h => h(page, {ref: 'page', props: {app}}) }).$mount('#page');
  const inp = host.$refs.page;
  inp.generate(false);
  assert.equal(jobs, 0, 'missing image must not start generation');
  inp.set_inp_image(file);
  await Vue.nextTick();
  const canvas = inp.$refs.inp_img_canvas;
  await canvas.image_loaded;
  inp.generate(false);
  assert.equal(jobs, 0, 'empty mask must not start generation');
  await canvas.restore_mask(mask);
  inp.generate(false);
  assert.equal(jobs, 1);
  assert.equal(inp.undo_history.length, 0, 'pending generation does not change undo history');
  callbacks.on_err('test failure');
  assert.equal(inp.undo_history.length, 0, 'failed generation does not change undo history');
  inp.generate(false);
  callbacks.on_img({generated_img_path: file});
  assert.equal(inp.undo_history.length, 1);
  await inp.discard_generation();
  assert.equal(inp.undo_history.length, 0, 'discard removes only the generated edit');
  assert(canvas.is_something_drawn, 'discard restores the mask');
  inp.generate(false);
  callbacks.on_img({generated_img_path: file});
  const beforeRetry = jobs;
  await inp.retry_generatge();
  assert.equal(jobs, beforeRetry + 1, 'retry submits after restoring');
  assert.equal(inp.undo_history.length, 0, 'retry replaces the previous result');
  callbacks.on_img({generated_img_path: file});
  inp.do_undo();
  assert.equal(inp.redo_history.length, 1);
  inp.do_redo();
  assert.equal(inp.undo_history.length, 1);
  inp.onDragFile({dataTransfer: {files: []}});
  assert.equal(inp.undo_history.length, 1, 'non-file drag is ignored');
  inp.set_inp_image(file);
  assert.equal(inp.retry_params, undefined, 'new image forgets old retry');
  assert.equal(inp.undo_history.length, 0);
  // Show the real page controls and canvas at the app's minimum window size.
  document.body.style.cssText = 'margin:16px;background:#fff;color:#222;font:14px system-ui';
  const style = document.createElement('style');
  style.textContent = '.inapint_container{height:380px;margin-top:35px} .l_button{margin:4px;padding:6px}';
  document.head.appendChild(style);
  canvas.on_resize();
  await canvas.restore_mask(mask);
  return 'PASS: real canvas pixels, loading, inversion, interrupted strokes, dimensions; generation guards, failure history, discard, retry, undo/redo, empty drop, new-image reset';
}
