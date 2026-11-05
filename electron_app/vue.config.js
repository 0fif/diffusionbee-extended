const path = require('path');
const resources = path.resolve(__dirname, '../.runtime/release-resources');
module.exports = {
    chainWebpack(config) {
        config.plugin('define').tap(args => {
            args[0].__VUE_PROD_HYDRATION_MISMATCH_DETAILS__ = false;
            return args;
        });
    },
    devServer: {hot: process.env.DIFFUSIONBEE_LIVE_RELOAD === '1', liveReload: false},
    pluginOptions: {
        electronBuilder: {
            preload: './src/preload.js',
            chainWebpackMainProcess(config) {
                config.output.hashFunction('sha256');
                config.optimization.minimize(false);
            },
            builderOptions: {
                appId: 'com.0fif.diffusionbee-extended',
                productName: 'DiffusionBee Extended',
                afterPack: './scripts/adhoc-sign.cjs',
                artifactName: 'DiffusionBee-Extended-${version}-${arch}.${ext}',
                extraResources: [
                    {from: resources, to: '.', filter: ['**/*']},
                    {from: '../backends/mflux', to: 'mflux', filter: ['runner.py', 'diagnostics.py', 'models.json', 'requirements*.txt']},
                    {from: '../LICENSE', to: 'LICENSE'}
                ],
                mac: {
                    icon: 'build/Icon-1024.png',
                    identity: null,
                    hardenedRuntime: false,
                    entitlements: 'build/entitlements.mac.plist',
                    entitlementsInherit: 'build/entitlements.mac.plist',
                    minimumSystemVersion: '26.0.0',
                    target: [{target:'dmg',arch:['arm64']}, {target:'zip',arch:['arm64']}]
                }
            }
        }
    }
};
