import { expect, test } from "@playwright/test";
test("public landing exposes product and conversion paths", async ({
  page,
}) => {
  await page.goto("/es");
  await expect(
    page.getByRole("heading", { name: /Tu vida cambia/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Probar demo gratis/i }).first(),
  ).toHaveAttribute("href", "/es/demo/today");
  await expect(
    page.getByAltText(/Vista de escritorio de Planora/i),
  ).toBeVisible();
  await page.getByRole("link", { name: "English" }).click();
  await page.waitForURL("**/en");
  expect(new URL(page.url()).pathname).toBe("/en");
  await expect(
    page.getByRole("heading", { name: /Your life changes/i }),
  ).toBeVisible();
});
test("PWA shell and connection status work offline", async ({
  page,
  context,
  browserName,
}) => {
  await page.goto("/es");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  try {
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(page.getByText("Sin conexión")).toBeVisible();
    if (browserName === "chromium") {
      await page.reload();
      await expect(
        page.getByRole("heading", { name: /Tu vida cambia/i }),
      ).toBeVisible();
    }
  } finally {
    await context.setOffline(false);
  }
});
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
