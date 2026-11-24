import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });

/** Writes dist/sw.js with every built file in its precache list and a version from their contents. */
const precache = (): Plugin => {
  let outDir = "dist";
  return {
    name: "bend-precache",
    apply: "build",
    configResolved: (config) => {
      outDir = config.build.outDir;
    },
    closeBundle: () => {
      const paths = files(outDir)
        .map((p) => relative(outDir, p).split(sep).join("/"))
        .filter((p) => p !== "sw.js")
        .sort();
      const hash = createHash("sha256");
      for (const p of paths) hash.update(p).update(readFileSync(join(outDir, p)));
      const assets = ["/", ...paths.map((p) => `/${p}`)];
      const template = readFileSync("src/sw/sw.js", "utf8");
      const sw = template.replace("__VERSION__", hash.digest("hex").slice(0, 12)).replace("__ASSETS__", JSON.stringify(assets));
      writeFileSync(join(outDir, "sw.js"), sw);
    },
  };
};

/** Preact compat stands in for React. See decisions: UI SDK passes the whole e2e and axe suite on it. */
const preact = [
  { find: /^react-dom\/client$/, replacement: "preact/compat/client" },
  { find: /^react-dom$/, replacement: "preact/compat" },
  { find: /^react\/jsx-(dev-)?runtime$/, replacement: "preact/jsx-runtime" },
  { find: /^react$/, replacement: "preact/compat" },
];

export default defineConfig({
  plugins: [react(), precache()],
  resolve: { alias: preact },
  build: { target: "es2022", assetsInlineLimit: 0, modulePreload: { polyfill: false } },
  preview: { port: 47310, strictPort: true },
  server: { port: 47311, strictPort: true },
});
