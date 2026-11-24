// Renders each move's key pose to public/moves/<id>-<dark|light>.webp: the slot's poster,
// shown before the lazy loop loads and under reduced motion. Same projector, same tokens,
// so the canvas takes over with no visible change.
// Usage: bun scripts/posters.ts   (needs the Playwright Chromium and cwebp)
import { chromium } from "@playwright/test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Inner size of the 88 px slot (1 px border) and the label strip the figure keeps clear of. Match play.ts. */
const SIZE = 86;
const LABEL = 12;
const DPR = 2;

const tmp = mkdtempSync(join(tmpdir(), "bend-posters-"));
const built = await Bun.build({ entrypoints: ["scripts/poster-page.ts"], outdir: tmp, target: "browser" });
if (!built.success) throw new AggregateError(built.logs, "poster page build failed");
const script = readFileSync(join(tmp, "poster-page.js"), "utf8");
const css = readFileSync("src/app/styles.css", "utf8").replace(/@font-face\s*{[^}]*}/g, "");

const moves = readdirSync("src/moves").filter((f) => f.endsWith(".json"));
mkdirSync("public/moves", { recursive: true });
const browser = await chromium.launch();
for (const scheme of ["dark", "light"] as const) {
  const page = await browser.newPage({ viewport: { width: 200, height: 200 }, deviceScaleFactor: DPR, colorScheme: scheme });
  await page.setContent(`<style>${css} html,body{background:transparent}</style><body></body>`);
  await page.addScriptTag({ content: script, type: "module" });
  await page.waitForFunction(() => typeof window.poster === "function");
  for (const file of moves) {
    const move = JSON.parse(readFileSync(join("src/moves", file), "utf8"));
    await page.evaluate(([m, size, label]) => window.poster(m, size, label), [move, SIZE, LABEL] as const);
    const png = join(tmp, `${move.id}-${scheme}.png`);
    await page.locator("canvas").screenshot({ path: png, omitBackground: true });
    const out = `public/moves/${move.id}-${scheme}.webp`;
    const cwebp = Bun.spawnSync(["cwebp", "-quiet", "-q", "90", "-alpha_q", "100", "-m", "6", png, "-o", out]);
    if (cwebp.exitCode !== 0) throw new Error(`cwebp failed for ${out}: ${cwebp.stderr}`);
    console.log(`${out} ${Bun.file(out).size} B`);
  }
  await page.close();
}
await browser.close();
