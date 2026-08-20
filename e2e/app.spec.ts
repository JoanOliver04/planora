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

test("demo exposes the current product areas without registration", async ({
  page,
}) => {
  await page.goto("/es/demo/more");
  const main = page.locator("#main-content");
  for (const area of [
    "Mes",
    "Buscar",
    "Enfoque",
    "Estadísticas",
    "Recordatorios",
    "Plantillas",
    "Datos",
  ]) {
    await expect(main.getByRole("link", { name: area })).toBeVisible();
  }
  await main.getByRole("link", { name: "Enfoque" }).click();
  await expect(page).toHaveURL(/\/es\/demo\/focus/);
  await expect(page.getByText("25:00")).toBeVisible();
  await page.getByRole("button", { name: "Iniciar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pausar" })).toBeVisible();
  await expect(page.getByText("24:59")).toBeVisible({ timeout: 2_500 });
});

test("demo mobile navigation routes extra tools through More", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/es/demo/today");
  await page.locator(".mobile-nav").getByRole("link", { name: "Más" }).click();
  await expect(page).toHaveURL(/\/es\/demo\/more/);
  await expect(
    page.locator("#main-content").getByRole("link", { name: "Enfoque" }),
  ).toBeVisible();
});

test("mobile navigation stays pinned above scrollable content", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/es/demo/today");
  const navigation = page.locator(".mobile-nav");
  await expect(navigation).toBeVisible();
  const box = await navigation.boundingBox();
  expect(box).not.toBeNull();
  expect(
    Math.abs((box?.y ?? 0) + (box?.height ?? 0) - 844),
  ).toBeLessThanOrEqual(1);
  const bottomPadding = await page
    .locator("main")
    .evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).paddingBottom),
    );
  expect(bottomPadding).toBeGreaterThanOrEqual(box?.height ?? 0);
});

test("narrow mobile layouts keep public content readable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });

  await page.goto("/es/demo/today");
  await expect(page.locator(".demo-topbar")).toHaveCSS(
    "flex-direction",
    "column",
  );
  const demoCta = await page
    .locator(".demo-topbar")
    .getByRole("link", { name: /Crear mi cuenta/i })
    .boundingBox();
  expect(demoCta?.height).toBeGreaterThanOrEqual(44);

  await page.goto("/es/demo/week");
  const firstDay = await page.locator(".week-grid .day").first().boundingBox();
  expect(firstDay?.width).toBeGreaterThanOrEqual(140);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);

  await page.goto("/es");
  for (const locator of [
    page.locator(".landing-brand"),
    page.locator(".landing-language"),
    page.locator(".landing-text-link"),
  ]) {
    const target = await locator.boundingBox();
    expect(target?.height).toBeGreaterThanOrEqual(44);
  }
});
