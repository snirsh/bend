import { expect, test, type Page } from "@playwright/test";
import { importBackup, mockupHistory, repsInput, restTime, weightInput } from "./helpers.ts";

const focusOutline = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const style = getComputedStyle(el);
    return { tag: el.tagName, style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });

const expectVisibleFocus = async (page: Page) => {
  const ring = await focusOutline(page);
  expect(ring.style, `focus ring on ${ring.tag}`).not.toBe("none");
  expect(ring.width).toBeGreaterThanOrEqual(2);
};

test("one set logged with the keyboard only, with a visible focus ring at every stop", async ({ page }) => {
  await page.goto("/");
  await importBackup(page, mockupHistory());
  await page.locator("body").focus();

  for (let i = 0; i < 8 && !(await weightInput(page).evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press("Tab");
    await expectVisibleFocus(page);
  }
  await expect(weightInput(page)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(weightInput(page)).toHaveValue("82.5");

  await page.keyboard.press("Tab");
  await expect(repsInput(page)).toBeFocused();
  await expectVisibleFocus(page);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("9");

  await page.keyboard.press("Tab");
  await expect(page.getByRole("radio", { name: "2", exact: true })).toBeFocused();
  await expectVisibleFocus(page);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "3", exact: true })).toBeChecked();

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Log set" })).toBeFocused();
  await expectVisibleFocus(page);
  await page.keyboard.press("Enter");

  await expect(page.locator('.pill[data-state="done"]').first()).toContainText("Sq 1 · 82.5×9");
  await expect(page.getByRole("heading", { name: "Row · set 1 of 3" })).toBeVisible();
  await expect(restTime(page)).toHaveText(/^(2:00|1:59)$/);
});

test("the cue tooltip opens on hover, keyboard focus and tap", async ({ page, browser }) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: /More about the .* cue/ });
  const tip = page.getByRole("tooltip");

  await trigger.hover();
  await expect(tip).toBeVisible();
  await page.mouse.move(5, 800);
  await expect(tip).toBeHidden();

  await page.locator("body").focus();
  await trigger.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(trigger).toBeFocused();
  await expect(tip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tip).toBeHidden();

  const touch = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const phone = await touch.newPage();
  await phone.goto("/");
  await phone.getByRole("button", { name: /More about the .* cue/ }).tap();
  await expect(phone.getByRole("tooltip")).toBeVisible();
  await phone.locator("h1").tap();
  await expect(phone.getByRole("tooltip")).toBeHidden();
  await touch.close();
});

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`every control is at least 44 × 44 px at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    // Reduced motion shows every loop control: play and the step buttons.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await importBackup(page, mockupHistory());
    await expect(page.getByRole("button", { name: "Next step" })).toBeVisible();
    const controls = page.locator('button:visible, input:visible, a:visible, [role="switch"]:visible, [role="radio"]:visible').and(page.locator(':not([aria-hidden="true"])'));
    const count = await controls.count();
    expect(count).toBeGreaterThan(10);
    const small: string[] = [];
    for (let i = 0; i < count; i++) {
      const c = controls.nth(i);
      const box = await c.boundingBox();
      if (!box || box.width < 44 || box.height < 44) {
        small.push(`${await c.evaluate((el) => el.outerHTML.slice(0, 80))} ${box?.width}x${box?.height}`);
      }
    }
    expect(small).toEqual([]);
  });
}
