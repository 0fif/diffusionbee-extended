// UI support ported from the official 2.5.3 frontend; see docs/RELEASE_SOURCE.md.
function model_available(model, backend) {
    const minimum = Number(model.min_version || 0);
    if (minimum <= 29) return true;
    const type = (model.model_meta_data || {}).type;
    return !!(backend && backend.modern_models && backend.build >= minimum &&
        (type === 'sd_model' || type === 'flux_nnc'));
}

function apply_model_options(options, metadata = {}) {
    if (metadata.type === 'flux_nnc') {
        options.pipeline = 'flux';
        options.flux_model_type = metadata.sd_type === 'flux_dev' ? 'dev' : 'schnell';
        delete options.negative_prompt;
        delete options.controlnet_model;
        options.is_control_net = false;
    }
    return options;
}

export {model_available, apply_model_options};
