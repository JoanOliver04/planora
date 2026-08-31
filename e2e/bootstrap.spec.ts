import { expect, test } from "@playwright/test";

test("mobile landing paints product UI instead of a stuck logo splash", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/es");
  await expect(
    page.getByRole("heading", { name: /Tu vida cambia/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Probar demo gratis/i }).first(),
  ).toBeVisible();
  const heroLogo = page.locator(".landing-hero-visual img");
  const box = await heroLogo.boundingBox();
  expect(box?.width ?? 0).toBeLessThan(280);
});

test("mobile login stays usable and does not fill the viewport with the logo", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/es/login");
  await expect(page.getByRole("button", { name: /Google/i })).toBeVisible();
  const logo = page.locator(".brand-logo").first();
  const box = await logo.boundingBox();
  expect(box?.width ?? 0).toBeLessThanOrEqual(200);
  expect(box?.height ?? 0).toBeLessThanOrEqual(200);
});

test("production service worker is not cached and public HTML still works offline", async ({
  page,
  context,
  browserName,
}) => {
  const sw = await page.goto("/sw.js");
  expect(sw?.ok()).toBeTruthy();
  expect(sw?.headers()["cache-control"] ?? "").toMatch(/no-store|no-cache/);

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

test("demo on a narrow Android viewport leaves the splash and shows navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/es/demo/today");
  await expect(page.locator(".mobile-nav")).toBeVisible();
  await expect(page.locator("#main-content")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Hoy/i }).first(),
  ).toBeVisible();
});
