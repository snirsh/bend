import { expect, test } from "@playwright/test";
import { importBackup, localDate, logPrefilled, logSetButton, mockupHistory, repsInput, savedHistory, savedWorkout, restTime, weightInput } from "./helpers.ts";

test("a never-logged exercise asks for a starting weight with the field focused", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("pick a starting weight")).toBeVisible();
  await expect(weightInput(page)).toBeFocused();
  await expect(weightInput(page)).toHaveValue("");
  await expect(weightInput(page)).toHaveAttribute("inputmode", "decimal");
  await expect(repsInput(page)).toHaveAttribute("inputmode", "numeric");
  await expect(logSetButton(page)).toBeDisabled();
  await expect(page.getByText("dev fixture", { exact: true })).toBeVisible();
});

test("prefills from last time, steps by the equipment increment, and advances in superset order", async ({ page }) => {
  await page.goto("/");
  await importBackup(page, mockupHistory());
  await expect(page.getByText("session B · superset 1 of 1")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Squat · set 1 of 3" })).toBeVisible();
  await expect(weightInput(page)).toHaveValue("80");
  await expect(repsInput(page)).toHaveValue("8");
  await expect(page.getByText("last 80 × 8", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Increase weight" }).click();
  await expect(weightInput(page)).toHaveValue("82.5");
  await repsInput(page).fill("9");
  await page.getByRole("radio", { name: "1", exact: true }).click();
  await logSetButton(page).click();

  await expect(page.getByRole("heading", { name: "Row · set 1 of 3" })).toBeVisible();
  await expect(page.locator('.pill[data-state="done"]').first()).toContainText("Sq 1 · 82.5×9");
  await expect(restTime(page)).toHaveText(/^(2:00|1:59)$/);
  await expect(page.locator('[data-timer="rest"]')).toHaveAttribute("data-state", "run");
  await expect(weightInput(page)).toHaveValue("60");
  await expect(repsInput(page)).toHaveValue("10");

  await logPrefilled(page);
  await expect(page.getByRole("heading", { name: "Squat · set 2 of 3" })).toBeVisible();
  // Weight follows the last set logged this session.
  await expect(weightInput(page)).toHaveValue("82.5");
});

test("a reload mid-workout resumes at the same set with rough night kept", async ({ page }) => {
  await page.goto("/");
  await importBackup(page, mockupHistory());
  await logPrefilled(page);
  await page.getByRole("switch", { name: "Rough night" }).click();
  await expect(page.getByRole("switch", { name: "Rough night" })).toBeChecked();
  await expect.poll(async () => (await savedWorkout(page))?.tags).toEqual(["rough-night"]);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Row · set 1 of 3" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Rough night" })).toBeChecked();
});

test("a malformed import is rejected with a clear error and keeps history", async ({ page }) => {
  await page.goto("/");
  await importBackup(page, mockupHistory());
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByTestId("import-file").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{ nope") });
  await expect(page.getByRole("alert")).toContainText("Not a bend backup");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(weightInput(page)).toHaveValue("80");
});

test("a deload after a 1-week gap shows its badge and lighter weight", async ({ page }) => {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  await page.goto("/");
  await importBackup(page, mockupHistory(weekAgo));
  await expect(page.getByText(/^session B · deload/)).toBeVisible();
  await expect(page.locator(".mode-badge")).toHaveText("deload");
  // 90% of 80 is 72, rounded down to the 2.5 kg grid.
  await expect(weightInput(page)).toHaveValue("70");
  await expect(page.getByRole("heading", { name: "Squat · set 1 of 2" })).toBeVisible();
});

test("a bridge after a 2-week gap shows the target RPE", async ({ page }) => {
  await page.goto("/");
  await importBackup(page, mockupHistory(new Date(Date.now() - 18 * 86_400_000)));
  await expect(page.locator(".mode-badge")).toHaveText("bridge · RPE 5");
  await expect(weightInput(page)).toHaveValue("62.5");
});

test("finishing early takes a second tap and saves only the logged sets", async ({ page }) => {
  await page.goto("/");
  await importBackup(page, mockupHistory());
  await logPrefilled(page);
  await logPrefilled(page);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Finish early" }).click();
  await expect(page.getByRole("heading", { name: "Session B saved" })).toBeHidden();
  await page.getByRole("button", { name: "Tap again to save 2 sets and finish" }).click();
  await expect(page.getByRole("heading", { name: "Session B saved" })).toBeVisible();
  await expect(page.getByText("2 sets · 2 moves")).toBeVisible();
  await expect(page.locator('[data-timer="cooldown"]')).toHaveAttribute("data-state", "run");
  await expect(page.locator('[data-timer="rest"]')).toHaveAttribute("data-state", "idle");
  const history = await savedHistory(page);
  expect(history.map((s) => s.letter)).toEqual(["A", "B"]);
  await page.getByRole("button", { name: "Start next session" }).click();
  await expect(page.getByText(/^session C/)).toBeVisible();
});

test("a typed weight is logged as typed, not snapped to the stepper grid", async ({ page }) => {
  await page.goto("/");
  await importBackup(page, mockupHistory());
  await weightInput(page).fill("61");
  await repsInput(page).click();
  await expect(weightInput(page)).toHaveValue("61");
  await page.getByRole("button", { name: "Increase weight" }).click();
  await expect(weightInput(page)).toHaveValue("62.5");
  await weightInput(page).fill("61.25");
  await logSetButton(page).click();
  await expect(page.locator('.pill[data-state="done"]').first()).toContainText("Sq 1 · 61.25×8");
});

test("a fast double tap on Log set logs one set", async ({ page }) => {
  await page.goto("/");
  await importBackup(page, mockupHistory());
  await logSetButton(page).dblclick();
  await expect(page.locator('.pill[data-state="done"]')).toHaveCount(1);
  await expect.poll(async () => (await savedWorkout(page))?.logged.length).toBe(1);
});

test("a workout left unfinished on an earlier day is saved under that day and today starts fresh", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  await importBackup(page, mockupHistory());
  await logPrefilled(page);
  await logPrefilled(page);
  await expect.poll(async () => (await savedWorkout(page))?.logged.length).toBe(2);
  const then = await page.evaluate(() => Date.now());
  await page.clock.setSystemTime(then + 3 * 86_400_000);
  await page.reload();
  await expect(page.getByText(/^session C/)).toBeVisible();
  const history = await savedHistory(page);
  expect(history.map((s) => [s.letter, s.exercises.reduce((n, e) => n + e.sets.length, 0)])).toEqual([["A", 9], ["B", 2]]);
  expect(history[1]!.date).toBe(localDate(0, new Date(then)));
});

test("a failed save is reported, not hidden", async ({ page }) => {
  await page.goto("/");
  await importBackup(page, mockupHistory());
  await page.evaluate(() => {
    IDBDatabase.prototype.transaction = () => {
      throw new DOMException("Connection to Indexed Database server lost", "UnknownError");
    };
  });
  await logPrefilled(page);
  await expect(page.getByRole("alert")).toContainText("not saved");
});
