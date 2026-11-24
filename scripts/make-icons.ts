// Renders public/icons/icon.svg to the PNG sizes the manifest and iOS need.
// Usage: bun scripts/make-icons.ts
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const svg = readFileSync("public/icons/icon.svg", "utf8");
const markup = (size: number, maskable: boolean) => {
  const inner = maskable ? svg.replace('rx="112"', 'rx="0"') : svg;
  const scale = maskable ? 0.8 : 1;
  return `<body style="margin:0;background:${maskable ? "#0C0B0A" : "transparent"};display:grid;place-items:center;width:${size}px;height:${size}px">
    <div style="width:${size * scale}px;height:${size * scale}px">${inner.replace("<svg ", `<svg width="${size * scale}" height="${size * scale}" `)}</div></body>`;
};

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, maskable] of [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-maskable-512.png", 512, true],
  ["apple-touch-icon.png", 180, true],
] as const) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(markup(size, maskable));
  await page.screenshot({ path: `public/icons/${name}`, omitBackground: !maskable });
}
await browser.close();
