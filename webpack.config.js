const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

/**
 * The preload runs sandboxed, where `require` resolves only electron and a few
 * built-ins — never a relative path. It therefore has to be bundled into one
 * self-contained file, or its imports throw and nothing reaches `window`.
 */
const preloadConfig = (isProduction) => ({
  name: "preload",
  entry: "./src/main/preload.ts",
  target: "electron-preload",
  output: {
    path: path.resolve(__dirname, "dist", "main"),
    filename: "preload.js",
  },
  resolve: { extensions: [".ts", ".js"] },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: "ts-loader",
          options: { configFile: "tsconfig.preload.json" },
        },
        exclude: /node_modules/,
      },
    ],
  },
  devtool: isProduction ? "source-map" : "eval-source-map",
  mode: isProduction ? "production" : "development",
});

module.exports = (env, argv) => {
  const isProduction = argv.mode === "production";

  const rendererConfig = {
    name: "renderer",
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
          // Without an explicit config, ts-loader falls back to tsconfig.json,
          // whose src/**/* glob pulls the tests into the shipped bundle.
          use: {
            loader: "ts-loader",
            options: { configFile: "tsconfig.renderer.json" },
          },
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

  return [rendererConfig, preloadConfig(isProduction)];
};
