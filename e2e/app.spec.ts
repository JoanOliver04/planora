import { expect, test } from "@playwright/test";
test("protected route redirects to Google login", async ({ page }) => {
  await page.goto("/es/today");
  await expect(page).toHaveURL(/\/es\/login/);
  await expect(page.getByRole("button", { name: /Google/i })).toBeVisible();
});
test("language switch works", async ({ page }) => {
  await page.goto("/es/login");
  await page.getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en\/login/);
});
test("mobile login remains usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/es/login");
  await expect(page.getByRole("button", { name: /Google/i })).toBeVisible();
});
