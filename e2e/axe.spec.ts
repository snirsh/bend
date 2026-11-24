import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { importBackup, logPrefilled, mockupHistory } from "./helpers.ts";

/** Where the raw axe results go. Outside the repo by default. */
const OUT = process.env.AXE_OUT ?? join(process.env.HOME ?? ".", "code/bend-logging-notes/proof/axe");

const states: Record<string, (page: Page) => Promise<void>> = {
  fresh: async (page) => {
    await page.goto("/");
    await expect(page.getByText("pick a starting weight")).toBeVisible();
  },
  "mid-session-tooltip-open": async (page) => {
    await page.goto("/");
    await importBackup(page, mockupHistory());
    for (let i = 0; i < 3; i++) await logPrefilled(page);
    await page.getByRole("button", { name: /More about the .* cue/ }).click();
    await expect(page.getByRole("tooltip")).toBeVisible();
  },
  finished: async (page) => {
    await page.goto("/");
    await importBackup(page, mockupHistory());
    for (let i = 0; i < 9; i++) await logPrefilled(page);
    await page.getByRole("button", { name: "Finish session" }).click();
    await expect(page.getByRole("heading", { name: /saved/ })).toBeVisible();
  },
};

for (const [state, reach] of Object.entries(states)) {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    for (const colorScheme of ["dark", "light"] as const) {
      const name = `${state}-${viewport.width}x${viewport.height}-${colorScheme}`;
      test(`axe: no serious or critical violations, ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
        await reach(page);
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
        mkdirSync(OUT, { recursive: true });
        writeFileSync(join(OUT, `${name}.json`), JSON.stringify(results, null, 2));
        const blocking = results.violations
          .filter((v) => v.impact === "serious" || v.impact === "critical")
          .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
        expect(blocking).toEqual([]);
      });
    }
  }
}
