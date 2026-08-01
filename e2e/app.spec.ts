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
test("demo is public, interactive and persists locally", async ({ page }) => {
  await page.goto("/es/login");
  await page.getByRole("link", { name: /demo interactiva/i }).click();
  await expect(page).toHaveURL(/\/es\/demo\/today/);
  const task = page.getByRole("button", {
    name: /Revisar prioridades del día/,
  });
  await task.click();
  await expect(task).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Revisar prioridades del día/ }),
  ).toHaveAttribute("aria-pressed", "true");
});
test("demo disables real account actions", async ({ page }) => {
  await page.goto("/es/demo/settings");
  await expect(page.getByText(/nunca modifica cuentas reales/i)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /eliminar cuenta/i }),
  ).toHaveCount(0);
});
