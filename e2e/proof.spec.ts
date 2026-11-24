// Proof artifacts: parity screenshots, before/after composites, a video of one set, and the INP lab proxy.
// Skipped unless PROOF=1. Writes to PROOF_OUT (default ~/code/bend-logging-notes/proof).
import { expect, test, type Page } from "@playwright/test";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { importBackup, logPrefilled, mockupHistory } from "./helpers.ts";

const HOME = process.env.HOME ?? ".";
const OUT = process.env.PROOF_OUT ?? join(HOME, "code/bend-logging-notes/proof");
const MOCKUPS = join(HOME, "code/bend-logging-notes/mockups");

test.skip(!process.env.PROOF, "set PROOF=1 to capture proof artifacts");
test.describe.configure({ mode: "serial" });

/** The mockup's moment: session B, squat 1, row 1 and squat 2 logged, row set 2 up next, rest at 1:28. */
const reachMockupState = async (page: Page) => {
  await page.clock.install();
  await page.goto("/");
  await importBackup(page, mockupHistory());
  for (let i = 0; i < 3; i++) await logPrefilled(page);
  await expect(page.getByRole("heading", { name: "Row · set 2 of 3" })).toBeVisible();
  const startedAt = await page.evaluate(() => JSON.parse(localStorage.getItem("bend.timers.v1") ?? "{}").rest.startedAt as number);
  await page.clock.pauseAt(startedAt + 32_000);
  await expect(page.locator('[data-timer="rest"] .time')).toHaveText("1:28");
  await page.locator("body").focus();
};

for (const scheme of ["dark", "light"] as const) {
  test(`parity screenshots, ${scheme}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 390, height: 844 });
    await reachMockupState(page);
    const built = join(OUT, `after-390x844-${scheme}.png`);
    await page.screenshot({ path: built });
    await page.screenshot({ path: join(OUT, `after-390-${scheme}-full.png`), fullPage: true });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({ path: join(OUT, `after-1280x800-${scheme}.png`) });

    const before = join(OUT, `before-mockup-390x844-${scheme}.png`);
    copyFileSync(join(MOCKUPS, `dir2-${scheme}.png`), before);
    const b64 = (p: string) => `data:image/png;base64,${readFileSync(p).toString("base64")}`;
    const composite = await page.context().newPage();
    await composite.setViewportSize({ width: 390 * 2 + 48, height: 844 + 40 });
    await composite.setContent(`<body style="margin:0;background:#888;font:600 13px system-ui;color:#000;display:flex;gap:16px;padding:8px 16px">
      <figure style="margin:0"><figcaption>before = mockup</figcaption><img src="${b64(before)}" width="390" height="844"></figure>
      <figure style="margin:0"><figcaption>after = built</figcaption><img src="${b64(built)}" width="390" height="844"></figure></body>`);
    await composite.screenshot({ path: join(OUT, `compare-390x844-${scheme}.png`) });
  });
}

test("video: log one set", async ({ browser }) => {
  const dir = join(OUT, "video-raw");
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", recordVideo: { dir, size: { width: 390, height: 844 } } });
  const page = await context.newPage();
  await page.goto("/");
  await importBackup(page, mockupHistory());
  await page.waitForTimeout(1200);
  const plus = page.getByRole("button", { name: "Increase weight" });
  for (let i = 0; i < 2; i++) {
    await plus.click();
    await page.waitForTimeout(600);
  }
  const reps = page.getByLabel("Reps", { exact: true });
  await reps.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("9", { delay: 200 });
  await page.waitForTimeout(800);
  await page.getByRole("radio", { name: "1", exact: true }).click();
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Log set" }).click();
  await expect(page.locator('[data-timer="rest"]')).toHaveAttribute("data-state", "run");
  await page.waitForTimeout(4000);
  const video = page.video();
  await context.close();
  writeFileSync(join(OUT, "video-raw-path.txt"), (await video?.path()) ?? "");
});

test("INP lab proxy: stepper, RIR and Log set taps at 4x CPU slowdown", async ({ page }) => {
  await page.goto("/");
  await importBackup(page, mockupHistory());
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.evaluate(() => {
    const w = window as unknown as { __events: { name: string; duration: number; id: number }[] };
    w.__events = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEventTiming & { interactionId: number })[]) {
        if (e.interactionId) w.__events.push({ name: e.name, duration: e.duration, id: e.interactionId });
      }
    }).observe({ type: "event", durationThreshold: 16, buffered: true } as PerformanceObserverInit);
  });
  const plus = page.getByRole("button", { name: "Increase weight" });
  for (let i = 0; i < 10; i++) await plus.click();
  await page.getByRole("radio", { name: "1", exact: true }).click();
  await page.getByRole("button", { name: "Log set" }).click();
  await page.waitForTimeout(500);
  const events = await page.evaluate(() => (window as unknown as { __events: { name: string; duration: number; id: number }[] }).__events);
  const byInteraction = new Map<number, number>();
  for (const e of events) byInteraction.set(e.id, Math.max(byInteraction.get(e.id) ?? 0, e.duration));
  const durations = [...byInteraction.values()].sort((a, b) => a - b);
  const report = { cpuSlowdown: 4, interactions: durations.length, worstMs: durations.at(-1) ?? 0, durationsMs: durations, events };
  writeFileSync(join(OUT, "inp-lab.json"), JSON.stringify(report, null, 2));
  console.log(`INP lab proxy: ${durations.length} interactions, worst ${report.worstMs} ms`);
  expect(report.worstMs).toBeLessThanOrEqual(200);
});
