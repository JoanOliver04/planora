import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("public landing has no critical accessibility violations", async ({
  page,
}) => {
  await page.goto("/es");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    results.violations.filter((item) => item.impact === "critical"),
  ).toEqual([]);
});

test("interactive demo has no serious accessibility violations", async ({
  page,
}) => {
  for (const path of ["today", "focus", "statistics", "more"]) {
    await page.goto(`/es/demo/${path}`);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(
      results.violations.filter(
        (item) => item.impact === "critical" || item.impact === "serious",
      ),
      `Accessibility violations in demo/${path}`,
    ).toEqual([]);
  }
});
