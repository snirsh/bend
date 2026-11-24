import { expect, test } from "@playwright/test";
import { logPrefilled, moveFiles, savedHistory } from "./helpers.ts";

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
  const cached = await page.evaluate(async () => {
    const paths: string[] = [];
    for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) paths.push(new URL(request.url).pathname);
    return paths;
  });
  const chunk = (name: string) => cached.some((p) => new RegExp(`^/assets/${name}-[\\w-]+\\.js$`).test(p));
  expect(chunk("play"), "loop code cached").toBe(true);
  for (const { id } of moveFiles) {
    expect(chunk(id), `${id} chunk cached`).toBe(true);
    expect(cached).toEqual(expect.arrayContaining([`/moves/${id}-dark.webp`, `/moves/${id}-light.webp`]));
  }

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Squat · set 1 of 3" })).toBeVisible();
  // The fonts came from the precache too.
  expect(await page.evaluate(() => document.fonts.check('16px "Geist Mono"'))).toBe(true);

  const slots = await page.locator(".strip .pill").count();
  expect(slots).toBe(9);
  // Each move's loop plays offline the first time its set comes up.
  const played = new Set<string>();
  for (let i = 0; i < slots; i++) {
    const poster = page.locator(".loop img");
    const id = (await poster.count()) ? (await poster.getAttribute("src"))!.replace(/^\/moves\/(.+)-dark\.webp$/, "$1") : null;
    if (id && !played.has(id)) {
      await expect(page.locator(".loop canvas")).toBeVisible();
      played.add(id);
    }
    await logPrefilled(page, 40 + i);
  }
  expect([...played].sort()).toEqual(moveFiles.map((m) => m.id).sort());
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
