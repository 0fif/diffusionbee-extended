const path = require('path');
function runtimePaths({packaged, resources, project, userData, env = process.env}) {
    return {
        runner: env.MFLUX_RUNNER || path.join(packaged ? resources : project, packaged ? 'mflux' : 'backends/mflux', 'runner.py'),
        python: env.MFLUX_PYTHON || path.join(packaged ? resources : project, packaged ? 'mflux-runtime' : '.runtime/mflux-env', 'bin/python3'),
        modelsDir: env.MFLUX_MODEL_DIR || path.join(packaged ? userData : project, packaged ? 'models' : '.runtime/mflux-models'),
        core: env.BACKEND_BUILD_PATH || path.join(resources, 'core')
    };
}
module.exports = {runtimePaths};
