// Fails when the production build breaks the byte caps in docs/perf-budget.md.
// Usage: bun run build && bun run size
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const DIST = "dist";
const KB = 1024;
const CAPS = { js: 90 * KB, css: 8 * KB, fonts: 60 * KB, sw: 3 * KB };

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });

const gzip = (path: string) => gzipSync(readFileSync(path), { level: 9 }).length;
const all = files(DIST);
const html = readFileSync(join(DIST, "index.html"), "utf8");
// Initial JS: every script and modulepreload the HTML references.
const initialJs = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => join(DIST, m[1]!));
const css = all.filter((p) => p.endsWith(".css"));
const fonts = all.filter((p) => p.endsWith(".woff2"));

const rows = [
  { name: "initial JS (gzip)", bytes: initialJs.reduce((n, p) => n + gzip(p), 0), cap: CAPS.js },
  { name: "CSS (gzip)", bytes: css.reduce((n, p) => n + gzip(p), 0), cap: CAPS.css },
  { name: "fonts (woff2)", bytes: fonts.reduce((n, p) => n + statSync(p).size, 0), cap: CAPS.fonts },
  { name: "service worker (gzip)", bytes: gzip(join(DIST, "sw.js")), cap: CAPS.sw },
];

if (initialJs.length === 0) throw new Error("No initial JS found in dist/index.html; did the build run?");
let failed = false;
for (const { name, bytes, cap } of rows) {
  const over = bytes > cap;
  failed ||= over;
  console.log(`${over ? "FAIL" : "ok  "} ${name.padEnd(22)} ${(bytes / KB).toFixed(1).padStart(6)} KB / ${(cap / KB).toFixed(0)} KB`);
}
if (failed) process.exit(1);
