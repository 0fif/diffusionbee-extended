import validation from '../data/model_validation.json';
import {model_available} from './model_compatibility.js';

export const task_names = {txt2img:'Text to image', img2img:'Image to image', inpainting:'Selected edits'};
export function model_tasks(model) {
    const meta = model.model_meta_data || {};
    if (meta.tasks) return meta.tasks;
    if (meta.type === 'controlnet_model') return [];
    if (meta.type === 'sd_model_inpaint') return ['inpainting'];
    if (meta.type === 'flux_nnc') return ['txt2img'];
    return ['txt2img', 'img2img', 'inpainting'];
}
export function task_checks(model, backend) {
    const supported = model_tasks(model);
    return Object.entries(task_names).map(([task, name]) => ({task, name,
        status: !supported.includes(task) ? 'Unsupported' : !model_available(model, backend) ? 'Needs engine' :
            validation[model.id]?.tasks[task] === 'tested' && (!validation[model.id].revision || validation[model.id].revision === model.revision) ? 'Tested' : 'Untested'}));
}
export function validation_note(model) {
    const record = validation[model.id];
    if (record?.revision && record.revision !== model.revision) return 'This revision has not been checked in Extended.';
    return record ? `Checked ${record.date}. ${record.note}` : 'This model has not been checked in Extended. Engine compatibility alone does not verify its output.';
}
export function architecture_name(model) {
    const meta = model.model_meta_data || {};
    const names = {flux2_klein_4b:'FLUX.2 Klein 4B',flux2_klein_9b:'FLUX.2 Klein 9B',
        flux_schnell:'FLUX.1 Schnell',flux_dev:'FLUX.1 Dev',sdxl_base:'Stable Diffusion XL',
        SD_1x:'Stable Diffusion 1.x',SD_1x_inpaint:'Stable Diffusion 1.x Inpainting'};
    const precision = {float16:'16-bit',float8_1:'8-bit',nnc_float_q5p:'5-bit'};
    return [names[meta.sd_type] || meta.sd_type || 'Architecture not supplied', precision[meta.float_type] || meta.float_type].filter(Boolean).join(' · ');
}
