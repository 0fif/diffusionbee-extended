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
  const Vue = require(path.join(root, 'node_modules/vue/dist/vue.cjs.js'));
  const compiler = {parseComponent: text => require(path.join(root, 'node_modules/@vue/compiler-sfc')).parse(text).descriptor};
  const source = compiler.parseComponent(fs.readFileSync(path.join(root, 'src/components_bare/ImageCanvas.vue'), 'utf8'));
  const component = new Function(source.script.content.replace('export default', 'return'))();
  component.template = source.template.content;
  const css = document.createElement('style'); css.textContent = source.styles.map(s => s.content).join('\n'); document.head.appendChild(css);
  const fixture = document.createElement('canvas');
  fixture.width = 800; fixture.height = 400;
  fixture.getContext('2d').fillRect(0, 0, 800, 400);
  const file = path.join(require('os').tmpdir(), 'diffusionbee editor # fixture.png');
  fs.writeFileSync(file, Buffer.from(fixture.toDataURL().split(',')[1], 'base64'));
  const nativeSource=fs.readFileSync(path.join(root,'src/native_functions.js'),'utf8');
  const saveSource=nativeSource.slice(nativeSource.indexOf("ipcMain.on('save_file'"),nativeSource.indexOf("ipcMain.on('copy_to_clipboard'"));
  let saveHandler;const saveErrors=[];
  new Function('ipcMain','require','dialog',saveSource)({on:(_,handler)=>{saveHandler=handler;}},require,{showErrorBox:(title,message)=>saveErrors.push({title,message})});
  const savedPath=file+'.saved.png',saveEvent={};saveHandler(saveEvent,file+'||'+savedPath);
  assert.equal(saveEvent.returnValue,true);assert.deepEqual(fs.readFileSync(savedPath),fs.readFileSync(file));fs.unlinkSync(savedPath);
  saveHandler(saveEvent,file+'.missing||'+savedPath);
  assert.equal(saveEvent.returnValue,false);assert.equal(saveErrors.length,1,'Save failure returns to the UI and explains the error');
  document.body.innerHTML = '<h2>DiffusionBee Extended: canvas regression checks</h2><div id="host" style="width:400px;height:200px"><div id="mount"></div></div>';
  let resizeEvents=0;
  const canvasProps = Vue.reactive({tool:'brush',onViewChange:()=>resizeEvents++});
  const vmApp = Vue.createApp({ render: () => Vue.h(component, { ref: 'canvas', ...canvasProps,
    image_source: file, canvas_id: 'mask', canvas_d_id: 'image', is_inpaint: true, stroke_size_no: '30'
  }) });
  const vm = vmApp.mount('#mount');
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

  canvasProps.tool = 'eraser'; await Vue.nextTick();
  event('mousedown',100,50); event('mouseup',100,50,0);
  assert.equal(alpha(200,100),0,'eraser removes selected pixels');
  canvasProps.tool = 'rectangle'; await Vue.nextTick();
  event('mousedown',40,60); event('mousemove',80,90); event('mouseup',80,90,0);
  assert(alpha(100,140),'rectangle fills its interior');
  canvasProps.tool = 'pan'; await Vue.nextTick();
  const beforePan=editor.get_mask_for_cache();
  event('mousedown',100,50);event('mousemove',120,60);event('mouseup',120,60,0);
  assert.equal(editor.pan_x,20);assert.equal(editor.pan_y,10);
  assert.equal(editor.get_mask_for_cache(),beforePan,'pan preserves mask pixels');
  editor.fit_view();canvasProps.tool = 'brush'; await Vue.nextTick();
  await editor.restore_mask(mask);
  resizeEvents=0;
  editor.on_resize();editor.on_resize();
  assert.equal(resizeEvents,0,'unchanged resize does not emit another layout update');

  const compatibilitySource=fs.readFileSync(path.join(root,'src/utils/model_compatibility.js'),'utf8');
  const compat=new Function(compatibilitySource.replace(/export \{[^}]+\};/,'return {model_available,apply_model_options,supports_controlnet};'))();
  assert(!compat.model_available({min_version:40,model_meta_data:{type:'flux_nnc'}},{build:29}));
  assert(compat.model_available({min_version:40,model_meta_data:{type:'flux_nnc'}},{build:40,modern_models:true}));
  const flux=compat.apply_model_options({negative_prompt:'bad',controlnet_model:'old'},{type:'flux_nnc',sd_type:'flux_schnell'});
  assert.equal(flux.pipeline,'flux');assert.equal(flux.flux_model_type,'schnell');assert(!('negative_prompt' in flux));

  const controlSource=fs.readFileSync(path.join(root,'src/utils/controlnet_frontend_utils.js'),'utf8');
  const control=new Function('supports_controlnet',controlSource.replace(/^import .*$/gm,'').replace(/export \{[^}]+\}/,'return {controlnet_required_assets,controlnet_check_inputs,controlnet_proc_form_outputs};'))(compat.supports_controlnet);
  for(const metadata of [{type:'sd_model',sd_type:'SD_1x'}, {type:'sd_model',sd_type:'sdxl_base'}, {type:'flux_nnc'}, {type:'mflux_model',engine:'mflux'}]) {
    const supported=compat.supports_controlnet(metadata);
    const context={sd_options:{selected_sd_model:'selected',controlnet_model:'Depth',controlnet_input_image_path:''},app:{show_toast:()=>{},assets_manager:{all_avail_assets:{selected:{model_meta_data:metadata}},get_downloaded_asset_path:()=>'/depth.tdict'}}};
    const required=[];control.controlnet_required_assets(context,required);
    assert.equal(required.length,supported?1:0,'Hidden ControlNet must not request downloads');
    const messages=[];context.app.show_toast=msg=>messages.push(msg);
    assert.equal(control.controlnet_check_inputs(context),!supported,'Hidden ControlNet must not require an input image');
    const output=compat.apply_model_options({controlnet_model:'Depth',is_control_net:true},metadata);
    control.controlnet_proc_form_outputs(context,output);
    assert.equal(!!output.controlnet_tdict_path,supported,'Unsupported routes must not acquire a ControlNet path');
    assert.equal(output.is_control_net,supported);
    context.sd_options.controlnet_input_image_path='input.png';
    assert(control.controlnet_check_inputs(context),'Supported ControlNet still accepts its image');
  }
  const inpaintSource=fs.readFileSync(path.join(root,'src/utils/in_out_paint_utils.js'),'utf8');
  const prepInpaint=new Function(inpaintSource.replace(/export \{[^}]+\}/,'return prep_sd_optins;'))();
  for (const maskMode of ['native','composite']) {
    const options={};
    prepInpaint({sd_options:{selected_sd_model:'modern'},app:{assets_manager:{all_avail_assets:{modern:{model_meta_data:{engine:'mflux',mask_mode:maskMode}}}}}},options,'Generative Fill','mask.png');
    assert.equal(options.mask_image_path,maskMode==='native'?'mask.png':undefined);
    assert.equal(options.num_imgs,1);
    const retouchOptions={mask_image_path:'stale.png'};
    prepInpaint({retouch:true,sd_options:{selected_sd_model:'modern'},app:{assets_manager:{all_avail_assets:{modern:{model_meta_data:{engine:'mflux',mask_mode:maskMode}}}}}},retouchOptions,'Generative Fill','mask.png');
    assert.equal(retouchOptions.edit_operation,'retouch');
    assert.equal(retouchOptions.mask_image_path,undefined,'Retouch must not erase the source selection');
  }
  const imgPageSource=compiler.parseComponent(fs.readFileSync(path.join(root,'src/pages/Img2Img.vue'),'utf8'));
  const imgPage=new Function('SDImageGenerationApplet','Vue',imgPageSource.script.content.replace(/^import .*$/gm,'').replace('export default Img2Img;','return Img2Img;'))({},Vue);
  const imgOptions={input_img:'new.png',input_img__AUX__width:768,input_img__AUX__height:512,input_img__AUX__source:'old.png'};
  const imgContext={$refs:{sd_applet:{sd_options:imgOptions}},app:{show_toast:()=>{}}};
  assert.equal(imgPage.methods.check_options_input_fn.call(imgContext),false,'New source cannot use the previous image dimensions');
  imgOptions.input_img__AUX__source='new.png';
  assert.equal(imgPage.methods.check_options_input_fn.call(imgContext),true);
  imgOptions.input_img__AUX__width=undefined;
  assert.equal(imgPage.methods.check_options_input_fn.call(imgContext),false,'Missing dimensions cannot reach the backend');
  imgOptions.input_img__AUX__width=768;imgOptions.input_img__AUX__height=512;
  imgContext.app.assets_manager={all_avail_assets:{large:{model_meta_data:{min_edit_resolution:1024,dimension_multiple:32}}}};
  const sized=imgPage.methods.postprocess_form_options_fn.call(imgContext,{engine:'mflux',selected_sd_model:'large'});
  assert.equal(sized.img_width,1024);assert.equal(sized.img_height%32,0,'Larger editing models get valid default dimensions');
  const xlOptions={};
  prepInpaint({sd_options:{selected_sd_model:'xl'},app:{assets_manager:{all_avail_assets:{xl:{model_meta_data:{sd_type:'sdxl_base'}}}}}},xlOptions,'Generative Fill','mask.png');
  assert.equal(xlOptions.img_width,1024);assert.equal(xlOptions.img_height,1024);
  assert.equal(xlOptions.force_use_given_size,true);assert.equal(xlOptions.input_image_strength,80);

  const dreamOptions={input_img:'photo.png',guidance_scale:7.5};
  prepInpaint({sd_options:{selected_sd_model:'dream',input_image_strength:80,inp_only_update_masked:true},app:{assets_manager:{all_avail_assets:{dream:{model_meta_data:{type:'sd_model',sd_type:'SD_1x'}}},get_downloaded_asset_path:()=> 'control.tdict'}}},dreamOptions,'Generative Fill','mask.png');
  assert.equal(dreamOptions.sd_mode_override,'img2img','Ordinary SD checkpoints must start from the photo');
  assert.equal(dreamOptions.input_image_strength,80,'Preservation strength must reach the backend');
  assert.equal(dreamOptions.mask_image_path,'mask.png');assert.equal(dreamOptions.controlnet_model,'Inpaint');

  const gallerySource=compiler.parseComponent(fs.readFileSync(path.join(root,'src/components_bare/GalleryPane.vue'),'utf8'));
  const gallery=new Function('GalleryImage',gallerySource.script.content.replace(/^import .*$/gm,'').replace('export default','return'))({template:'<div style="height:200px"/>'});
  gallery.template=gallerySource.template.content;
  const galleryHost=document.createElement('div');galleryHost.style.cssText='width:600px;display:none';document.body.appendChild(galleryHost);
  const galleryMount=document.createElement('div');galleryHost.appendChild(galleryMount);
  const galleryApp=Vue.createApp({render:()=>Vue.h(gallery,{ref:'gallery',n_imgs:1,img_w:1024,img_h:768,image_data:[{job_id:'test'}],always_fixed_col_size:300})});const galleryVm=galleryApp.mount(galleryMount);
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
  window.removeEventListener('error',catchResize);galleryApp.unmount();galleryHost.remove();

  const pageSource = compiler.parseComponent(fs.readFileSync(path.join(root, 'src/pages/Inpainting.vue'), 'utf8'));
  const detailSource = fs.readFileSync(path.join(root,'src/utils/model_details.js'),'utf8').replace(/^import .*$/gm,'').replace(/export /g,'');
  const {tool_models} = new Function('validation','model_available',detailSource+';return {tool_models};')({},compat.model_available);
  const basicSource = compiler.parseComponent(fs.readFileSync(path.join(root, 'src/components/BasicSDApplet.vue'), 'utf8'));
  const basicComponent = new Function('Form','TwoColAppletLayout','DownloadButton','Vue','apply_model_options','model_available','find_in_form_recursive','tool_models','supports_controlnet',
    basicSource.script.content.replace(/^import .*$/gm, '').replace('export default', 'return'))(
    {}, {}, {}, Vue, compat.apply_model_options, compat.model_available, (id,form) => form.find(field=>field.id===id), tool_models, compat.supports_controlnet);
  const restored={sd_options:{}};
  basicComponent.methods.load_options.call(restored,{prompt:'processed',raw_form_options:{prompt:'original',is_adv_mode:true,custom_form_setting:7}});
  assert.equal(restored.sd_options.prompt,'original');
  assert.equal(restored.sd_options.custom_form_setting,7,'Restore fields that exist only in saved form data');
  for(const params of [{prompt:'recovered',seed:1},{applet_name:'upscale'},
      {prompt:'processed',raw_form_options:{prompt:'saved',input_img:'/old.png',seed:5,is_adv_mode:true}}]) {
    const original=JSON.stringify(params),form={input_img:'/previous.png',seed:99};let page;
    const receiver={app:{functions:{switch_page:value=>{page=value;}}},$refs:{sd_applet:{sd_options:form,load_options:options=>basicComponent.methods.load_options.call({sd_options:form},options)}}};
    imgPage.methods.send_to_img2img.call(receiver,'/result.png',params);
    assert.equal(form.input_img,'/result.png','Sending History result must not restore the old input');
    assert.equal(page,'Img2Img');assert.equal(JSON.stringify(params),original,'History metadata stays unchanged');
    if(params.raw_form_options)assert.equal(form.is_adv_mode,true);
  }
  for(const engine of ['mflux','legacy']) {
    const form=basicComponent.computed.input_form_elements_processed.call({input_form:[{id:'input_img',draw_mask:true,store_masked_image:true}],sd_options:{selected_sd_model:'test'},app:{assets_manager:{all_avail_assets:{test:{model_meta_data:{engine}}}}},form_tags:['img2img']});
    assert.equal(form[0].draw_mask,engine!=='mflux','Image-to-image must not offer a mask that its route ignores');
  }
  const unavailable = {id:'flux', min_version:40, model_meta_data:{type:'flux_nnc'}};
  const restricted = {id:'restricted',model_meta_data:{type:'mflux_model',tasks:['txt2img']}};
  const choices = tool_models({flux:unavailable, restricted}, {build:29}, 'inpainting');
  assert(!choices.some(m => ['flux','restricted'].includes(m.id)), 'unsupported tasks and unavailable engines excluded');
  const selectionError = basicComponent.computed.model_selection_error.call({name:'inpainting',tool_models:choices,sd_options:{selected_sd_model:'restricted'}});
  const blocked = [];
  assert.equal(basicComponent.methods.check_input_form_n_show_error.call({model_selection_error:selectionError,app:{show_toast:msg=>blocked.push(msg)}}),false);
  assert(blocked.length, 'stale selections blocked before backend preparation');
  assert.equal(basicComponent.computed.model_selection_error.call({name:'inpainting',tool_models:[{id:'installed'}],sd_options:{selected_sd_model:'installed'}}),'');
  assert.equal((pageSource.template.content.match(/@click="generate\(false\)"/g)||[]).length,1, 'only one primary generate action');
  assert.equal((pageSource.template.content.match(/Stop generation/g)||[]).length,1,'only one stop action');
  assert.deepEqual(basicComponent.computed.to_download_left.call({model_selection_error:'No models',required_assets_modified:[{id:'Default_SD1.5'},{id:'SD1.5_Inpainting'}]}),[], 'Missing selection must not force stock downloads');
  const basic = { props: ['sd_options','app'], template: '<div><slot name="input_buttons"/><slot name="output_workpace"/></div>',
    methods: {check_input_form_n_show_error: basicComponent.methods.check_input_form_n_show_error,
      get_sd_form_outputs() {return basicComponent.methods.get_sd_form_outputs.call({
        $refs: {form: {post_processed_form_outputs: () => ({})}}, sd_options: this.sd_options, app: this.app, name: 'inpainting'
      });}}, computed: {to_download_left: () => []} };
  const compositeSource = fs.readFileSync(path.join(root, 'src/utils/composite_inpaint.js'), 'utf8');
  const compositeFunctions = new Function(compositeSource.replace(/export /g, '') + '; return {composite_inpaint, prepare_inpaint_crop};')();
  const exportHelpers=new Function(fs.readFileSync(path.join(root,'src/utils/image_export.js'),'utf8').replace(/export /g,'')+';return {export_image,image_export_format};')();
  const page = new Function('save_image_data','export_image','image_export_format','GenerationStatus', 'composite_inpaint', 'prepare_inpaint_crop', 'require', 'ImageCanvas', 'BasicSDApplet', 'LoaderModal',
    'find_in_form_recursive', 'inpaint_assets', 'prep_sd_optins', 'tool_models',
    pageSource.script.content.replace(/^import .*$/gm, '').replace('export default Inpainting;', 'return Inpainting;'))(
    (encoded,temporary=false)=>{const file=window.ipcRenderer.sendSync('save_b64_image',encoded,temporary);if(!file)throw Error('Could not save image data.');return file;},
      exportHelpers.export_image, exportHelpers.image_export_format, {template:'<div/>'}, (...args) => {
        assert.equal(args[4], !inp.retry_params.retouch, 'Retouch keeps model colors; replacement matches the surrounding boundary');
        return compositeFunctions.composite_inpaint(...args);
      }, compositeFunctions.prepare_inpaint_crop, p => require(path.resolve(root, 'src/pages', p)), component, basic, {template: '<div/>'},
      () => ({}), () => [], () => {}, tool_models);
  page.template = pageSource.template.content;
  const messages = [];
  let callbacks;
  let jobs = 0;
  const backend = Vue.reactive({is_input_avail: true, text_to_img: (options, cb) => {assert.equal(options.prompt, 'Fix her eyes', 'fill-bar prompt reaches backend on generate and retry');callbacks = cb; jobs++;}});
  const keptEdits=[];const historyKeys=new Map();
  const app = Vue.reactive({assets_manager: {all_avail_assets:{'SD1.5_Inpainting':{id:'SD1.5_Inpainting',model_meta_data:{type:'sd_model_inpaint'}}}, get_downloaded_asset: () => ({}), get_downloaded_asset_path: () => file}, stable_diffusion: backend, functions: {add_to_history:(key,entry)=>{if(!historyKeys.has(key))historyKeys.set(key,keptEdits.length);keptEdits[historyKeys.get(key)]=entry;return true;}}, show_toast: msg => messages.push(msg)});
  const savedFiles=[];
  window.ipcRenderer = {sendSync: (...args) => {savedFiles.push(args);if(args[0]==='save_b64_image'&&!args[2]){const result=file+'.'+savedFiles.length+'.png';fs.writeFileSync(result,Buffer.from(args[1].split(',')[1],'base64'));return result;}return file;}};
  vmApp.unmount();
  document.body.innerHTML = '<div id="page"></div>';
  const hostApp = Vue.createApp({ render: () => Vue.h(page, {ref: 'page', app}) });
  const host = hostApp.mount('#page');
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
  assert.notEqual(savedFiles[savedFiles.length-1][2],true,'Completed edit must be stored outside temporary storage');
  await inp.discard_generation();
  assert.equal(keptEdits.length,1,'Every completed attempt stays in history even when discarded');
  assert.equal(inp.undo_history.length, 0, 'discard removes only the generated edit');
  assert(canvas.is_something_drawn, 'discard restores the mask');
  inp.generate(false);
  await callbacks.on_img({generated_img_path: file});
  const beforeRetry = jobs;
  await inp.retry_generatge();
  assert.equal(jobs, beforeRetry + 1, 'retry submits after restoring');
  assert.equal(inp.undo_history.length, 0, 'retry replaces the previous result');
  assert.equal(inp.retry_params.resolution,512,'Legacy model keeps its existing working size');
  await callbacks.on_img({generated_img_path: file});
  inp.keep_generation();inp.keep_generation();
  assert.equal(keptEdits.length,3,'Retry retains earlier attempts; Keep does not duplicate the completed attempt');
  assert(fs.existsSync(keptEdits[0].imgs[0].image_url));
  assert.equal(keptEdits[0].img_width,800);
  assert.equal(keptEdits[0].img_height,400);
  inp.do_undo();
  assert.equal(inp.redo_history.length, 1);
  inp.do_redo();
  assert.equal(inp.undo_history.length, 1);
  inp.onDragFile({dataTransfer: {files: []}});
  assert.equal(inp.undo_history.length, 1, 'non-file drag is ignored');
  inp.set_inp_image(file);
  assert.equal(inp.retry_params, undefined, 'new image forgets old retry');
  assert.equal(inp.undo_history.length, 0);
  app.backend_info={mflux:true};
  app.assets_manager.all_avail_assets['modern']={id:'modern',model_meta_data:{engine:'mflux',type:'mflux_model',tasks:['inpainting']}};
  inp.sd_options.selected_sd_model='modern';inp.edit_resolution=1024;
  await Vue.nextTick();await canvas.image_loaded;await canvas.restore_mask(mask);
  inp.generate(false);await callbacks.on_img({generated_img_path:file});
  const fullCrop={...inp.retry_params.crop};
  assert.equal(Math.max(inp.retry_params.width,inp.retry_params.height),1024);
  inp.edit_resolution=512;
  await inp.retry_generatge();
  assert.equal(Math.max(inp.retry_params.width,inp.retry_params.height),512,'Changing resolution must rebuild the cached retry input');
  assert.deepEqual(inp.retry_params.crop,fullCrop,'Retry resolution must not change context');
  await callbacks.on_img({generated_img_path:file});
  app.assets_manager.all_avail_assets['retouch-model']={id:'retouch-model',model_meta_data:{engine:'mflux',type:'mflux_model',tasks:['inpainting','img2img'],edit_mode:'instruction',mask_mode:'native'}};
  inp.sd_options.selected_sd_model='retouch-model';
  await Vue.nextTick();
  await inp.retry_generatge();
  assert.equal(inp.retry_params.retouch,true,'Instruction model defaults to retouch');
  assert(inp.retry_params.crop.width < fullCrop.width,'Retouch uses tighter context');
  await callbacks.on_img({generated_img_path:file});
  inp.edit_mode='replace';
  await inp.retry_generatge();
  assert.deepEqual(inp.retry_params.crop,fullCrop,'Switching mode rebuilds the replacement crop');
  await callbacks.on_img({generated_img_path:file});
  delete inp.retry_params.content;
  await inp.retry_generatge();
  assert(inp.retry_params.content,'Retries from older sessions rebuild stretched inputs');
  await callbacks.on_img({generated_img_path:file});
  app.assets_manager.all_avail_assets['large-edit']={id:'large-edit',model_meta_data:{engine:'mflux',type:'mflux_model',tasks:['inpainting','img2img'],edit_mode:'instruction',mask_mode:'native',min_edit_resolution:1024}};
  inp.sd_options.selected_sd_model='large-edit';
  await Vue.nextTick();
  assert.equal(inp.edit_resolution,'auto','Switching to a larger model must not leave a missing resolution option selected');
  await inp.retry_generatge();
  assert.equal(Math.max(inp.retry_params.width,inp.retry_params.height),1024);
  await callbacks.on_img({generated_img_path:file});
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
  const contextFull=compositeFunctions.prepare_inpaint_crop(original,selection,1024,1024);
  const automatic=compositeFunctions.prepare_inpaint_crop(original,selection,'auto',1024);
  assert.deepEqual(automatic.crop,contextFull.crop,'Auto keeps the same context');
  assert.equal(Math.max(automatic.width,automatic.height),640,'Small selection avoids enlarging the crop to 1024');
  const largeSelection=document.createElement('canvas');largeSelection.width=1600;largeSelection.height=1200;
  largeSelection.getContext('2d').fillRect(0,0,1600,1200);
  const capped=compositeFunctions.prepare_inpaint_crop(original,largeSelection,'auto',1024);
  assert.equal(Math.max(capped.width,capped.height),1024,'Large selections stay within the model working limit');
  const tiny=document.createElement('canvas');tiny.width=128;tiny.height=96;
  tiny.getContext('2d').fillRect(0,0,128,96);
  const minimum=compositeFunctions.prepare_inpaint_crop(tiny,tiny,'auto',1024);
  assert.equal(Math.max(minimum.width,minimum.height),512,'Auto retains a minimum working size for the model');
  const largeMinimum=compositeFunctions.prepare_inpaint_crop(tiny,tiny,'auto',1024,true,1024);
  assert.equal(Math.max(largeMinimum.width,largeMinimum.height),1024,'Auto honors a model-specific minimum');
  for(const resolution of [512,768]) {
    const smaller=compositeFunctions.prepare_inpaint_crop(original,selection,resolution,1024);
    assert.deepEqual(smaller.crop,contextFull.crop,'Resolution changes must preserve surrounding context');
    assert.equal(Math.max(smaller.width,smaller.height),resolution);
  }
  const contentRegion=prepared.content;
  assert(Math.abs(contentRegion.width*prepared.width/(contentRegion.height*prepared.height)-prepared.crop.width/prepared.crop.height)<1e-10,'Model input preserves exact source aspect ratio');
  const roundTrip=await compositeFunctions.composite_inpaint(original.toDataURL(),selection.toDataURL(),prepared.image,prepared.crop,false,contentRegion);
  const roundTripImage=new Image();roundTripImage.src=roundTrip;await roundTripImage.decode();
  const check=document.createElement('canvas');check.width=1600;check.height=1200;check.getContext('2d').drawImage(roundTripImage,0,0);
  assert.deepEqual([...check.getContext('2d').getImageData(750,530,1,1).data],[18,52,86,255],'Padding is removed before compositing');
  assert.notEqual(prepared.width,prepared.height,'rectangular selection does not require a square model input');
  assert.equal(prepared.width%64,0);assert.equal(prepared.height%64,0);
  const generated=document.createElement('canvas');generated.width=generated.height=512;
  generated.getContext('2d').fillStyle='red';generated.getContext('2d').fillRect(0,0,512,512);
  const composed=await compositeFunctions.composite_inpaint(original.toDataURL(),selection.toDataURL(),generated.toDataURL(),prepared.crop,false);
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
  const matched=await compositeFunctions.composite_inpaint(background.toDataURL(),region.toDataURL(),edit.toDataURL());
  const matchedImage=new Image();matchedImage.src=matched;await matchedImage.decode();bg.drawImage(matchedImage,0,0);
  const sample=(x,y)=>[...bg.getImageData(x,y,1,1).data];
  assert.deepStrictEqual(sample(20,20),[120,110,100,255],'color matching preserves unselected source exactly');
  assert(sample(70,60).slice(0,3).every((v,i)=>Math.abs(v-[120,110,100][i])<=2),'background tint removed inside rectangle');
  assert(sample(120,90)[2]>sample(120,90)[0]+100,'intended blue object survives boundary color matching');
  return 'PASS: zoom, mask undo/redo, native-resolution crop/composite, real canvas pixels, loading, inversion, interrupted strokes, dimensions; generation guards, failure history, discard, retry, undo/redo, empty drop, new-image reset';
}
