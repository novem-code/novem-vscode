const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: './novem_web_view/index.tsx',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, '../dist/novem_web_view'),
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  plugins: [

    new HtmlWebpackPlugin({
      template: './novem_web_view/index.html',
      filename: 'index.html',
      inject: 'body',
      scriptLoading: 'blocking'
    })
  ],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ],
  },
  devServer: {
    static: {
      directory: path.join(__dirname, '../dist/novem_web_view'),
    },

    compress: true,
    port: 9000, // you can specify any port you like
  },
};

