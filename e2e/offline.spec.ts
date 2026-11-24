import { expect, test } from "@playwright/test";
import { logPrefilled, savedHistory } from "./helpers.ts";

test.use({ serviceWorkers: "allow" });

test("after one online load, a full session logs and saves offline", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
    }
  });
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.state)).toBe("activated");

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Squat · set 1 of 3" })).toBeVisible();
  // The fonts came from the precache too.
  expect(await page.evaluate(() => document.fonts.check('16px "Geist Mono"'))).toBe(true);

  const slots = await page.locator(".strip .pill").count();
  expect(slots).toBe(9);
  for (let i = 0; i < slots; i++) await logPrefilled(page, 40 + i);
  await page.getByRole("button", { name: "Finish session" }).click();
  await expect(page.getByRole("heading", { name: "Session A saved" })).toBeVisible();
  await expect(page.locator('[data-timer="cooldown"]')).toHaveAttribute("data-state", "run");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Session A saved" })).toBeVisible();
  const history = await savedHistory(page);
  expect(history).toHaveLength(1);
  expect(history[0]!.letter).toBe("A");
  expect(history[0]!.exercises.map((e) => [e.exerciseId, e.sets.length])).toEqual([
    ["smith-squat", 3],
    ["chest-supported-row", 3],
    ["bench-press", 3],
  ]);
});
