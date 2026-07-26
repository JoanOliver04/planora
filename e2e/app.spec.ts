import { expect, test } from "@playwright/test";
test("redirects root to a locale", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/(es|en)\/today/);
});
test("mobile navigation is usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/es/today");
  await expect(page.getByRole("navigation").last()).toBeVisible();
});
