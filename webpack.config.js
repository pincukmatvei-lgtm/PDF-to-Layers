const path = require("path");

// Bundles src/ (plus pdf-lib) into plugin/main.js, which index.html loads.
// UXP forbids eval, so source maps must not use eval-based devtools.
module.exports = (env, argv) => ({
  entry: "./src/index.js",
  output: {
    path: path.resolve(__dirname, "plugin"),
    filename: "main.js",
  },
  target: "web",
  devtool: argv.mode === "development" ? "cheap-source-map" : false,
  externals: {
    photoshop: "commonjs2 photoshop",
    uxp: "commonjs2 uxp",
  },
  performance: { hints: false },
});
