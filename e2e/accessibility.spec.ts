import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("public landing has no critical accessibility violations", async ({ page }) => {
  await page.goto("/es");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.filter((item) => item.impact === "critical")).toEqual([]);
});
