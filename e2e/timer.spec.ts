import { expect, test, type Page } from "@playwright/test";
import { logPrefilled, restTime, seconds } from "./helpers.ts";

const setVisibility = (page: Page, state: "hidden" | "visible") =>
  page.evaluate((s) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => s });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => s === "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);

/**
 * Freezes the page clock, hides the page, moves the wall clock to `msAfterStart` after the
 * rest started without running any timer callbacks, then shows the page again.
 */
const hiddenUntil = async (page: Page, startedAt: number, msAfterStart: number) => {
  await page.clock.pauseAt(startedAt + 1_000);
  await setVisibility(page, "hidden");
  await page.clock.setSystemTime(startedAt + msAfterStart);
  await setVisibility(page, "visible");
};

let startedAt = 0;

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  await logPrefilled(page);
  await expect(page.locator('[data-timer="rest"]')).toHaveAttribute("data-state", "run");
  // The start time the app stored, so the gap is measured from the real start.
  startedAt = await page.evaluate(() => JSON.parse(localStorage.getItem("bend.timers.v1") ?? "{}").rest.startedAt as number);
});

test("after 90 s hidden, the rest timer shows 0:30 of 2:00", async ({ page }) => {
  await hiddenUntil(page, startedAt, 90_000);
  const shown = await restTime(page).innerText();
  console.log(`rest shown after 90 s hidden: ${shown}`);
  expect(Math.abs(seconds(shown) - 30)).toBeLessThanOrEqual(1);
});

test("a rest that ends while hidden shows done on return", async ({ page }) => {
  await hiddenUntil(page, startedAt, 150_000);
  await expect(restTime(page)).toHaveText("0:00");
  await expect(page.locator('[data-timer="rest"]')).toHaveAttribute("data-state", "done");
  await expect(page.locator('[data-timer="rest"]').getByText("done", { exact: true })).toBeVisible();
});

test("a paused rest keeps its remaining time through a reload", async ({ page }) => {
  await page.getByRole("button", { name: "Pause" }).click();
  const paused = await restTime(page).innerText();
  await page.clock.fastForward(60_000);
  await page.reload();
  await expect(restTime(page)).toHaveText(paused);
  await expect(page.locator('[data-timer="rest"]')).toHaveAttribute("data-state", "paused");
});

test("a wall clock jumping back does not give rest time back, and an expired rest stays done", async ({ page }) => {
  await page.clock.pauseAt(startedAt + 90_000);
  await expect(restTime(page)).toHaveText("0:30");
  await page.clock.setSystemTime(startedAt + 30_000);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(restTime(page)).toHaveText("0:30");

  await page.clock.setSystemTime(startedAt + 125_000);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator('[data-timer="rest"]')).toHaveAttribute("data-state", "done");
  await page.clock.setSystemTime(startedAt + 10_000);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator('[data-timer="rest"]')).toHaveAttribute("data-state", "done");
  // Preact runs effects on animation frames, which a paused fake clock never delivers.
  await page.clock.resume();
  await page.reload();
  await expect(page.locator('[data-timer="rest"]')).toHaveAttribute("data-state", "done");
  await expect(restTime(page)).toHaveText("0:00");
});
