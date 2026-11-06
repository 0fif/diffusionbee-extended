const path = require('path');
const webpack = require('webpack');
const {VueLoaderPlugin} = require('vue-loader');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const output = path.resolve(__dirname, 'dist_electron/bundled');
module.exports = mode => {
    const common = {mode, context:__dirname, devtool:false, output:{path:output,filename:'[name].js'},
        resolve:{extensions:['.js','.cjs','.vue','.json'],alias:{'@':path.resolve(__dirname,'src')}},
        performance:{hints:false}};
    return [
        {...common,name:'renderer',target:'web',entry:{app:'./src/main.js'},output:{...common.output,publicPath:'./'},
            module:{rules:[{test:/\.vue$/,loader:'vue-loader'},
                {test:/\.css$/,use:['style-loader','css-loader']},
                {test:/\.(png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot|mp3|wav)$/i,type:'asset/resource',generator:{filename:'assets/[name].[contenthash:8][ext]'}}]},
            plugins:[new VueLoaderPlugin(),new webpack.DefinePlugin({__VUE_OPTIONS_API__:true,__VUE_PROD_DEVTOOLS__:false,__VUE_PROD_HYDRATION_MISMATCH_DETAILS__:false}),
                new HtmlWebpackPlugin({template:'public/index.html',title:'DiffusionBee Extended',templateParameters:{BASE_URL:'./'}})]},
        {...common,name:'main',target:'electron-main',entry:{background:'./src/background.js'},optimization:{minimize:false},
            externals:{'electron-context-menu':'commonjs electron-context-menu','electron-localshortcut':'commonjs electron-localshortcut'},
            node:{__dirname:false,__filename:false}},
        {...common,name:'preload',target:'electron-preload',entry:{preload:'./src/preload.js'},node:{__dirname:false,__filename:false}}
    ];
};
