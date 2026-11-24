import { expect, type Page } from "@playwright/test";

const pad = (n: number) => String(n).padStart(2, "0");
/** The local calendar date `days` from now, as the app computes it. */
export const localDate = (days = 0, from = new Date()) => {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const same = (n: number, weight: number, reps: number, rir: number) => Array.from({ length: n }, () => ({ weight, reps, rir }));

/** One A session two days ago, so today is session B with the mockup's numbers (row 60 × 10 last time). */
export const mockupHistory = (from = new Date()) => ({
  app: "bend",
  schemaVersion: 1,
  exportedAt: from.toISOString(),
  sessions: [
    {
      date: localDate(-2, from),
      letter: "A",
      tags: [],
      exercises: [
        { exerciseId: "smith-squat", sets: same(3, 80, 8, 2) },
        { exerciseId: "chest-supported-row", sets: [{ weight: 60, reps: 10, rir: 2 }, { weight: 60, reps: 10, rir: 2 }, { weight: 60, reps: 9, rir: 1 }] },
        { exerciseId: "bench-press", sets: same(3, 60, 8, 2) },
      ],
    },
  ],
});

/** Imports a backup through the app's own menu. */
export const importBackup = async (page: Page, backup: unknown) => {
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByTestId("import-file").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.getByRole("status").filter({ hasText: "Imported" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
};

export const weightInput = (page: Page) => page.getByLabel("Weight", { exact: true });
export const repsInput = (page: Page) => page.getByLabel("Reps", { exact: true });
export const logSetButton = (page: Page) => page.getByRole("button", { name: "Log set" });

/** Logs the current set with whatever is prefilled, typing a weight when there is none. */
export const logPrefilled = async (page: Page, fallbackWeight = 40) => {
  const weight = weightInput(page);
  if ((await weight.inputValue()) === "") await weight.fill(String(fallbackWeight));
  const rir = page.getByRole("radio", { checked: true });
  if ((await rir.count()) === 0) await page.getByRole("radio", { name: "2", exact: true }).click();
  await logSetButton(page).click();
};

export const restTime = (page: Page) => page.locator('[data-timer="rest"] .time');

export const seconds = (clock: string) => {
  const [m, s] = clock.split(":").map(Number);
  return m! * 60 + s!;
};

/** Reads the saved workout in progress straight from IndexedDB. */
export const savedWorkout = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ logged: unknown[]; tags: string[] } | null>((resolve, reject) => {
        const open = indexedDB.open("bend");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const get = open.result.transaction("state").objectStore("state").get("inProgress");
          get.onsuccess = () => resolve(get.result ?? null);
          get.onerror = () => reject(get.error);
        };
      }),
  );

/** Reads the stored history straight from IndexedDB. */
export const savedHistory = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ date: string; letter: string; tags: string[]; exercises: { exerciseId: string; sets: unknown[] }[] }[]>((resolve, reject) => {
        const open = indexedDB.open("bend");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const get = open.result.transaction("sessions").objectStore("sessions").getAll();
          get.onsuccess = () => resolve(get.result);
          get.onerror = () => reject(get.error);
        };
      }),
  );
