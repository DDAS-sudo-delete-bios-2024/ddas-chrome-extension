const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
    entry: {
        popup : './src/popup.js', // Entry points
        serviceWorker: './src/serviceworker.js',
    },
    output: {
        filename: '[name].bundle.js',
        path: path.resolve(__dirname, 'dist'),
    },
    mode: 'development',  // Change to 'production' when you're ready to deploy
    devtool: false, // This ensures no eval is used, using eval gives error which results in serviceworker not being loaded
    watch: true, // Keep for development, disable in production
    plugins: [
        new CopyWebpackPlugin({
            patterns: [
                { from: 'static' }  // Ensure assets are copied correctly
            ]
        })
    ]
};
