// Bundles the extension's half that runs in VS Code (src/extension.ts, with the Dhole build it reads text with) into one CommonJS
// file, dist/extension.js, which is what VS Code loads. The preview's half needs no build: media/ is shipped as it is.
import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const options = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  format: "cjs",
  platform: "node",
  target: "node18",
  external: ["vscode"],
  sourcemap: true,
  minify: !watch,
  logLevel: "info",
};
if (watch) await (await esbuild.context(options)).watch();
else await esbuild.build(options);
