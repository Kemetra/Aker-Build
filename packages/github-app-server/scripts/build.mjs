import { rm } from "node:fs/promises";
import { build } from "esbuild";

await rm("dist", { recursive: true, force: true });

await build({
  entryPoints: {
    server: "src/bin.ts",
    "worker-entry": "src/worker-entry.ts",
  },
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  banner: {
    js: 'import { createRequire as __akerCreateRequire } from "node:module"; const require = __akerCreateRequire(import.meta.url);',
  },
  minify: false,
  sourcemap: false,
  legalComments: "none",
  logLevel: "info",
});
