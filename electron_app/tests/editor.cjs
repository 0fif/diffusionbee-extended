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
  const css = document.createElement('style'); css.textContent = source.styles.map(s => s.content).join('\n'); document.head.appendChild(css);
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
  await Vue.nextTick();
  assert(editor.is_ready, 'image with spaces and # loads');
  assert.deepStrictEqual(editor.get_size(), {width: 800, height: 400});
  const rect = editor.canvas.getBoundingClientRect();
  // Synthetic pointer events cannot establish native capture; native gestures are checked in the live app.
  editor.$refs.viewport.setPointerCapture = () => {};
  editor.$refs.viewport.hasPointerCapture = () => false;
  const event = (type, x, y, buttons = 1) => editor.$refs.viewport.dispatchEvent(new PointerEvent(type.replace('mouse','pointer'), {
    clientX: rect.left + x, clientY: rect.top + y, button: 0, buttons, pointerId: 1, bubbles:true
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

  const beforeZoom = editor.get_mask_for_cache();
  editor.zoom_to(2); await Vue.nextTick();
  assert.equal(editor.get_mask_for_cache(), beforeZoom, 'zoom does not change mask pixels');
  assert.equal(editor.canvas.width, 800, 'zoom does not change export size');
  editor.fit_view(); await Vue.nextTick();
  editor.remember_mask(); editor.ctx.clearRect(0,0,800,400); editor.mask_changed();
  editor.undo_mask(); assert(alpha(200,100), 'mask undo restores stroke');
  editor.redo_mask(); assert.equal(alpha(200,100),0,'mask redo restores erasure');
  await editor.restore_mask(mask);

  editor._props.tool = 'eraser';
  event('mousedown',100,50); event('mouseup',100,50,0);
  assert.equal(alpha(200,100),0,'eraser removes selected pixels');
  editor._props.tool = 'rectangle';
  event('mousedown',40,60); event('mousemove',80,90); event('mouseup',80,90,0);
  assert(alpha(100,140),'rectangle fills its interior');
  editor._props.tool = 'pan';
  const beforePan=editor.get_mask_for_cache();
  event('mousedown',100,50);event('mousemove',120,60);event('mouseup',120,60,0);
  assert.equal(editor.pan_x,20);assert.equal(editor.pan_y,10);
  assert.equal(editor.get_mask_for_cache(),beforePan,'pan preserves mask pixels');
  editor.fit_view();editor._props.tool = 'brush';
  await editor.restore_mask(mask);
  let resizeEvents=0;editor.$on('view-change',()=>resizeEvents++);
  editor.on_resize();editor.on_resize();
  assert.equal(resizeEvents,0,'unchanged resize does not emit another layout update');

  const compatibilitySource=fs.readFileSync(path.join(root,'src/utils/model_compatibility.js'),'utf8');
  const compat=new Function(compatibilitySource.replace(/export \{[^}]+\};/,'return {model_available,apply_model_options};'))();
  assert(!compat.model_available({min_version:40,model_meta_data:{type:'flux_nnc'}},{build:29}));
  assert(compat.model_available({min_version:40,model_meta_data:{type:'flux_nnc'}},{build:40,modern_models:true}));
  const flux=compat.apply_model_options({negative_prompt:'bad',controlnet_model:'old'},{type:'flux_nnc',sd_type:'flux_schnell'});
  assert.equal(flux.pipeline,'flux');assert.equal(flux.flux_model_type,'schnell');assert(!('negative_prompt' in flux));

  const inpaintSource=fs.readFileSync(path.join(root,'src/utils/in_out_paint_utils.js'),'utf8');
  const prepInpaint=new Function(inpaintSource.replace(/export \{[^}]+\}/,'return prep_sd_optins;'))();
  const xlOptions={};
  prepInpaint({sd_options:{selected_sd_model:'xl'},app:{assets_manager:{all_avail_assets:{xl:{model_meta_data:{sd_type:'sdxl_base'}}}}}},xlOptions,'Generative Fill','mask.png');
  assert.equal(xlOptions.img_width,1024);assert.equal(xlOptions.img_height,1024);
  assert.equal(xlOptions.force_use_given_size,true);assert.equal(xlOptions.input_image_strength,80);

  const gallerySource=compiler.parseComponent(fs.readFileSync(path.join(root,'src/components_bare/GalleryPane.vue'),'utf8'));
  const gallery=new Function('GalleryImage',gallerySource.script.content.replace(/^import .*$/gm,'').replace('export default','return'))({template:'<div style="height:200px"/>'});
  gallery.template=gallerySource.template.content;
  const galleryHost=document.createElement('div');galleryHost.style.cssText='width:600px;display:none';document.body.appendChild(galleryHost);
  const galleryVm=new Vue({render:h=>h(gallery,{ref:'gallery',props:{n_imgs:1,img_w:1024,img_h:768,image_data:[{job_id:'test'}],always_fixed_col_size:300}})}).$mount();
  galleryHost.appendChild(galleryVm.$el);
  const pane=galleryVm.$refs.gallery;
  pane.on_resize();assert.equal(pane.last_layout_key,undefined,'hidden gallery does not compute a zero-width grid');
  const resizeErrors=[];const catchResize=e=>{if(e.message.includes('ResizeObserver'))resizeErrors.push(e.message)};
  window.addEventListener('error',catchResize);
  for(const width of [600,420,800,600]){
    galleryHost.style.display='block';galleryHost.style.width=width+'px';
    await new Promise(resolve=>setTimeout(resolve,50));
    pane.on_resize();const stableStyle=pane.inner_pane_style;pane.on_resize();
    assert.strictEqual(pane.inner_pane_style,stableStyle,'unchanged gallery layout does not write reactive styles');
  }
  assert.equal(resizeErrors.length,0,'gallery resizing does not trigger ResizeObserver loop errors');
  window.removeEventListener('error',catchResize);galleryVm.$destroy();galleryHost.remove();

  const pageSource = compiler.parseComponent(fs.readFileSync(path.join(root, 'src/pages/Inpainting.vue'), 'utf8'));
  const basicSource = compiler.parseComponent(fs.readFileSync(path.join(root, 'src/components/BasicSDApplet.vue'), 'utf8'));
  const basicComponent = new Function('Form','TwoColAppletLayout','DownloadButton','Vue','apply_model_options','model_available','find_in_form_recursive',
    basicSource.script.content.replace(/^import .*$/gm, '').replace('export default', 'return'))(
    {}, {}, {}, Vue, compat.apply_model_options, compat.model_available, () => ({}));
  const basic = { props: ['sd_options','app'], template: '<div><slot name="input_buttons"/><slot name="output_workpace"/></div>',
    methods: {check_input_form_n_show_error: basicComponent.methods.check_input_form_n_show_error,
      get_sd_form_outputs() {return basicComponent.methods.get_sd_form_outputs.call({
        $refs: {form: {post_processed_form_outputs: () => ({})}}, sd_options: this.sd_options, app: this.app, name: 'inpainting'
      });}}, computed: {to_download_left: () => []} };
  const compositeSource = fs.readFileSync(path.join(root, 'src/utils/composite_inpaint.js'), 'utf8');
  const compositeFunctions = new Function(compositeSource.replace(/export /g, '') + '; return {composite_inpaint, prepare_inpaint_crop};')();
  const page = new Function('GenerationStatus', 'composite_inpaint', 'prepare_inpaint_crop', 'require', 'ImageCanvas', 'BasicSDApplet', 'LoaderModal',
    'find_in_form_recursive', 'inpaint_assets', 'prep_sd_optins',
    pageSource.script.content.replace(/^import .*$/gm, '').replace('export default Inpainting;', 'return Inpainting;'))(
      {template:'<div/>'}, compositeFunctions.composite_inpaint, compositeFunctions.prepare_inpaint_crop, p => require(path.resolve(root, 'src/pages', p)), component, basic, {template: '<div/>'},
      () => ({}), () => [], () => {});
  page.template = pageSource.template.content;
  const messages = [];
  let callbacks;
  let jobs = 0;
  const backend = {is_input_avail: true, text_to_img: (options, cb) => {assert.equal(options.prompt, 'Fix her eyes', 'fill-bar prompt reaches backend on generate and retry');callbacks = cb; jobs++;}};
  const app = {assets_manager: {all_avail_assets:{}, get_downloaded_asset: () => ({}), get_downloaded_asset_path: () => file}, stable_diffusion: backend, functions: {}, show_toast: msg => messages.push(msg)};
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
  inp.sd_options.prompt = '   ';
  inp.generate(false);
  assert.equal(jobs, 0, 'blank fill prompt is rejected before submission');
  inp.sd_options.prompt = 'Fix her eyes';
  inp.generate(false);
  assert.equal(jobs, 1);
  assert.equal(inp.undo_history.length, 0, 'pending generation does not change undo history');
  callbacks.on_err('test failure');
  assert.equal(inp.undo_history.length, 0, 'failed generation does not change undo history');
  inp.generate(false);
  await callbacks.on_img({generated_img_path: file});
  assert.equal(inp.undo_history.length, 1);
  await inp.discard_generation();
  assert.equal(inp.undo_history.length, 0, 'discard removes only the generated edit');
  assert(canvas.is_something_drawn, 'discard restores the mask');
  inp.generate(false);
  await callbacks.on_img({generated_img_path: file});
  const beforeRetry = jobs;
  await inp.retry_generatge();
  assert.equal(jobs, beforeRetry + 1, 'retry submits after restoring');
  assert.equal(inp.undo_history.length, 0, 'retry replaces the previous result');
  await callbacks.on_img({generated_img_path: file});
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
  const original = document.createElement('canvas'); original.width=1600; original.height=1200;
  const originalCtx=original.getContext('2d'); originalCtx.fillStyle='#123456'; originalCtx.fillRect(0,0,1600,1200);
  const selection=document.createElement('canvas');selection.width=1600;selection.height=1200;
  selection.getContext('2d').fillRect(700,500,100,60);
  const prepared=compositeFunctions.prepare_inpaint_crop(original,selection,512);
  assert(prepared.crop.width < 1600, 'small selection crops its context, not the entire photo');
  assert.notEqual(prepared.width,prepared.height,'rectangular selection does not require a square model input');
  assert.equal(prepared.width%64,0);assert.equal(prepared.height%64,0);
  const generated=document.createElement('canvas');generated.width=generated.height=512;
  generated.getContext('2d').fillStyle='red';generated.getContext('2d').fillRect(0,0,512,512);
  const composed=await compositeFunctions.composite_inpaint(original.toDataURL(),selection.toDataURL(),generated.toDataURL(),prepared.crop);
  const composedImage=new Image();composedImage.src=composed;await composedImage.decode();
  assert.equal(composedImage.width,1600);assert.equal(composedImage.height,1200);
  originalCtx.drawImage(composedImage,0,0);
  assert.deepStrictEqual([...originalCtx.getImageData(0,0,1,1).data],[18,52,86,255],'unmasked source pixel preserved');
  assert.deepStrictEqual([...originalCtx.getImageData(750,530,1,1).data],[255,0,0,255],'generated crop lands inside selection');
  const edge=originalCtx.getImageData(701,530,1,1).data;
  assert(edge[0]>18 && edge[0]<255,'selection edge blends into original rather than pasting a hard rectangle');
  assert.deepStrictEqual([...originalCtx.getImageData(699,530,1,1).data],[18,52,86,255],'feather never changes pixels outside selection');
  // An instruction edit shifts the whole crop's exposure, even when only an object changes.
  const background=document.createElement('canvas');background.width=256;background.height=192;
  const bg=background.getContext('2d');bg.fillStyle='rgb(120,110,100)';bg.fillRect(0,0,256,192);
  const edit=document.createElement('canvas');edit.width=256;edit.height=192;
  const ed=edit.getContext('2d');ed.fillStyle='rgb(140,125,110)';ed.fillRect(0,0,256,192);
  ed.fillStyle='rgb(40,85,180)';ed.fillRect(105,75,40,40);
  const region=document.createElement('canvas');region.width=256;region.height=192;
  region.getContext('2d').fillRect(40,30,176,132);
  const matched=await compositeFunctions.composite_inpaint(background.toDataURL(),region.toDataURL(),edit.toDataURL(),null,true);
  const matchedImage=new Image();matchedImage.src=matched;await matchedImage.decode();bg.drawImage(matchedImage,0,0);
  const sample=(x,y)=>[...bg.getImageData(x,y,1,1).data];
  assert.deepStrictEqual(sample(20,20),[120,110,100,255],'color matching preserves unselected source exactly');
  assert(sample(70,60).slice(0,3).every((v,i)=>Math.abs(v-[120,110,100][i])<=2),'background tint removed inside rectangle');
  assert(sample(120,90)[2]>sample(120,90)[0]+100,'intended blue object survives boundary color matching');
  return 'PASS: zoom, mask undo/redo, native-resolution crop/composite, real canvas pixels, loading, inversion, interrupted strokes, dimensions; generation guards, failure history, discard, retry, undo/redo, empty drop, new-image reset';
}
