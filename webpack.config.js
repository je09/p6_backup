const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = (env, argv) => {
  const isProduction = argv.mode === "production";

  return {
    entry: "./src/renderer/index.tsx",
    target: "electron-renderer",
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "renderer.js",
      publicPath: "./",
    },
    resolve: {
      extensions: [".ts", ".tsx", ".js", ".jsx"],
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: "ts-loader",
          exclude: /node_modules/,
        },
        {
          test: /\.s[ac]ss$/i,
          use: ["style-loader", "css-loader", "sass-loader"],
        },
        {
          test: /\.css$/i,
          use: ["style-loader", "css-loader"],
        },
        {
          test: /\.(woff|woff2|ttf|eot)$/i,
          type: "asset/resource",
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: "./src/renderer/index.html",
        filename: "index.html",
      }),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: "assets/icon.png",
            to: "assets/icon.png",
          },
          {
            from: "assets/icons/",
            to: "assets/icons/",
          },
          {
            from: "assets/app.icns",
            to: "assets/app.icns",
            noErrorOnMissing: true,
          },
        ],
      }),
    ],
    devtool: isProduction ? "source-map" : "eval-source-map",
    mode: argv.mode || "development",
  };
};
