import { expect, test, type Page } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { logPrefilled } from "./helpers.ts";

type MoveFile = { id: string; keyPose: number; steps: { keyframe: number; label: string }[] };
const MOVES = new URL("../src/moves/", import.meta.url);
/** Every move that has a file, so bench and row join the suite when their files land. */
const moves: MoveFile[] = readdirSync(MOVES)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(new URL(f, MOVES), "utf8")));
const squat = moves.find((m) => m.id === "smith-squat")!;

/** The status a still at `step` reads, e.g. "3 of 3 · bottom". */
const status = (move: MoveFile, step: number) => `${step + 1} of ${move.steps.length} · ${move.steps[step]!.label}`;
/** The step whose segment holds the key pose: the last one at or before it. */
const keyStep = (move: MoveFile) => {
  for (let i = move.steps.length - 1; i >= 0; i--) if (move.steps[i]!.keyframe <= move.keyPose) return i;
  return move.steps.length - 1;
};

const slotOf = (page: Page) => page.getByRole("group", { name: "Squat movement loop" });

/** A hash of the loop canvas's pixels. */
const pixels = (page: Page) =>
  page.locator(".loop canvas").evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 0;
    for (let i = 0; i < data.length; i++) hash = (hash * 31 + data[i]!) | 0;
    return hash;
  });

/** Mean per-channel difference (0–255) between the canvas and the poster under it. */
const offPoster = (page: Page) =>
  page.locator(".loop").evaluate(async (slot) => {
    const canvas = slot.querySelector("canvas")!;
    const img = slot.querySelector("img")!;
    await img.decode();
    const ref = new OffscreenCanvas(canvas.width, canvas.height).getContext("2d")!;
    ref.drawImage(img, 0, 0, canvas.width, canvas.height);
    const a = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    const b = ref.getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!);
    return sum / a.length;
  });

/** Keeps the page still for `ms` and reports whether the canvas changed. */
const changesWithin = async (page: Page, ms: number) => {
  const before = await pixels(page);
  await page.waitForTimeout(ms);
  return (await pixels(page)) !== before;
};

/** Logs sets in the fixture flow until the slot holds `id`'s loop (row is the 2nd set, bench the 7th). */
const reach = async (page: Page, id: string) => {
  const poster = page.locator(`.loop img[src="/moves/${id}-dark.webp"]`);
  for (let i = 0; i < 9 && (await poster.count()) === 0; i++) await logPrefilled(page);
  await expect(poster).toBeAttached();
};

const tabTo = async (page: Page, name: string) => {
  const target = page.getByRole("button", { name });
  await expect(target).toBeVisible();
  await page.locator("body").focus();
  for (let i = 0; i < 12 && !(await target.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(target).toBeFocused();
  const ring = await target.evaluate((el) => getComputedStyle(el));
  expect(ring.outlineStyle).not.toBe("none");
  expect(parseFloat(ring.outlineWidth)).toBeGreaterThanOrEqual(2);
};

for (const move of moves) {
  test(`the ${move.id} loop takes over from its poster and moves`, async ({ page }) => {
    await page.goto("/");
    await reach(page, move.id);
    const slot = page.locator(".loop");
    await expect(slot.locator("canvas")).toBeVisible();
    await expect(slot.locator("picture")).toBeHidden();
    const first = await pixels(page);
    await expect.poll(() => pixels(page)).not.toBe(first);
  });
}

test("the loop draws nothing while the page is hidden or the slot is off screen", async ({ page }) => {
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    Object.assign(window, { frames: 0 });
    window.requestAnimationFrame = (callback) =>
      raf((now) => {
        Object.assign(window, { frames: (window as unknown as { frames: number }).frames + 1 });
        callback(now);
      });
  });
  const frames = () => page.evaluate(() => (window as unknown as { frames: number }).frames);
  /** Waits out one-shot frames (Preact schedules effects with one), then expects none for `ms`. A running loop never gets past the wait. */
  const stopsFor = async (ms: number) => {
    await expect
      .poll(async () => {
        const before = await frames();
        await page.waitForTimeout(150);
        return (await frames()) - before;
      })
      .toBe(0);
    const before = await frames();
    expect(await changesWithin(page, ms)).toBe(false);
    expect(await frames()).toBe(before);
  };
  const setHidden = (hidden: boolean) =>
    page.evaluate((hidden) => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);

  await page.goto("/");
  await expect(page.locator(".loop canvas")).toBeVisible();
  await expect.poll(frames).toBeGreaterThan(10);

  await setHidden(true);
  await stopsFor(500);
  await setHidden(false);
  const shown = await frames();
  await expect.poll(frames).toBeGreaterThan(shown + 10);

  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.style.height = "3000px";
    document.body.append(spacer);
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await stopsFor(500);
  await page.evaluate(() => window.scrollTo(0, 0));
  const back = await frames();
  await expect.poll(frames).toBeGreaterThan(back + 10);
});

test("the loop pauses and plays from the keyboard", async ({ page }) => {
  await page.goto("/");
  await tabTo(page, "Pause squat loop");
  await page.keyboard.press("Enter");

  const play = slotOf(page).getByRole("button", { name: "Play squat loop" });
  await expect(play).toBeFocused();
  await expect(slotOf(page).getByRole("status")).toHaveText(/^\d of \d · \S/);
  await expect(slotOf(page).getByRole("button", { name: "Next step" })).toBeVisible();
  expect(await changesWithin(page, 400)).toBe(false);

  await page.keyboard.press("Space");
  await expect(slotOf(page).getByRole("button", { name: "Pause squat loop" })).toBeFocused();
  await expect(slotOf(page).getByRole("status")).toHaveText("");
  await expect(slotOf(page).getByRole("button", { name: "Next step" })).toHaveCount(0);
  expect(await changesWithin(page, 400)).toBe(true);
});

test.describe("with reduced motion", () => {
  test.use({ deviceScaleFactor: 2 });

  test("the key pose shows still, and the steps go by keyboard", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const slot = slotOf(page);
    await expect(slot.getByRole("button", { name: "Play squat loop" })).toBeVisible();
    await expect(page.locator(".loop canvas")).toBeVisible();
    const key = keyStep(squat);
    await expect(slot.getByRole("status")).toHaveText(status(squat, key));
    expect(await offPoster(page)).toBeLessThan(1);
    expect(await changesWithin(page, 400)).toBe(false);

    await tabTo(page, "Next step");
    await page.keyboard.press("Enter");
    const next = (key + 1) % squat.steps.length;
    await expect(slot.getByRole("status")).toHaveText(status(squat, next));
    expect(await offPoster(page)).toBeGreaterThan(3);

    await page.keyboard.press("Shift+Tab");
    await expect(slot.getByRole("button", { name: "Previous step" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(slot.getByRole("status")).toHaveText(status(squat, key));
    expect(await offPoster(page)).toBeLessThan(1);
  });

  test("follows the setting live, and a pause stands through it", async ({ page }) => {
    await page.goto("/");
    const slot = slotOf(page);
    await expect(slot.getByRole("button", { name: "Pause squat loop" })).toBeVisible();

    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(slot.getByRole("button", { name: "Play squat loop" })).toBeVisible();
    await expect(slot.getByRole("status")).toHaveText(status(squat, keyStep(squat)));
    expect(await changesWithin(page, 400)).toBe(false);

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(slot.getByRole("button", { name: "Pause squat loop" })).toBeVisible();
    expect(await changesWithin(page, 400)).toBe(true);

    await slot.getByRole("button", { name: "Pause squat loop" }).click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(slot.getByRole("button", { name: "Play squat loop" })).toBeVisible();
    expect(await changesWithin(page, 400)).toBe(false);
  });
});

test("an invalid move file leaves the poster as the still", async ({ page }) => {
  const errors: Error[] = [];
  const warnings: string[] = [];
  page.on("pageerror", (error) => errors.push(error));
  page.on("console", (message) => message.type() === "warning" && warnings.push(message.text()));
  await page.route("**/assets/smith-squat-*.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: 'export default { id: "smith-squat", keyframes: [] };' }),
  );
  await page.goto("/");
  await expect.poll(() => warnings.length).toBe(1);
  await expect(page.getByRole("img", { name: "Squat movement loop" })).toBeVisible();
  await expect(page.locator(".loop img")).toBeVisible();
  await expect(page.locator(".loop canvas")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /squat loop/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});
