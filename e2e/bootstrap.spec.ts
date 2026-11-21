import { expect, offlineNetworkError, test } from "./fixtures";

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
  await expect(heroLogo).toBeVisible();
  await heroLogo.evaluate((image: HTMLImageElement) => image.decode());
  const box = await heroLogo.boundingBox();
  expect(box?.width ?? 0).toBeLessThan(280);

  const tabIcon = page.locator('head link[rel="icon"]');
  await expect(tabIcon).toHaveAttribute("href", /^\/favicon\.ico(?:\?|$)/);
  const appleIcon = page.locator('head link[rel="apple-touch-icon"]');
  await expect(appleIcon).toHaveAttribute(
    "href",
    /^\/apple-touch-icon\.png\?v=.+$/,
  );
  await expect(appleIcon).toHaveAttribute("sizes", "180x180");
});

test("mobile login stays usable and does not fill the viewport with the logo", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/es/login");
  await expect(page.getByRole("button", { name: /Google/i })).toBeVisible();
  const logo = page.getByRole("img", { name: "Planora" });
  await expect(logo).toBeVisible();
  await logo.evaluate((image: HTMLImageElement) => image.decode());
  const box = await logo.boundingBox();
  expect(box?.width ?? 0).toBeLessThanOrEqual(200);
  expect(box?.height ?? 0).toBeLessThanOrEqual(200);
});

test("production service worker is not cached and public HTML still works offline", async ({
  page,
  context,
  browserName,
  browserDiagnostics,
}) => {
  browserDiagnostics.allowConsoleError(offlineNetworkError);
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
      // Use new variant URLs so the HTTP image cache cannot mask a missing
      // service-worker fallback, including screenshots not yet scrolled into view.
      await page.evaluate(async () => {
        await Promise.all(
          Array.from(document.images).map(async (image) => {
            const source = new URL(image.currentSrc || image.src);
            source.searchParams.set("offline-check", "1");
            image.loading = "eager";
            image.removeAttribute("srcset");
            image.src = source.href;
            await image.decode();
          }),
        );
      });
      expect(
        await page
          .locator("main img")
          .evaluateAll((images) =>
            images.every(
              (image) =>
                image instanceof HTMLImageElement && image.naturalWidth > 0,
            ),
          ),
      ).toBe(true);

      const icons = await page.evaluate(async () => {
        const manifest = await fetch("/manifest.webmanifest").then((response) =>
          response.json(),
        );
        const appleIcon = document.querySelector<HTMLLinkElement>(
          'link[rel="apple-touch-icon"]',
        );
        if (!appleIcon) throw new Error("Missing Apple touch icon metadata");
        const paths = [
          "/favicon.ico?offline-check=1",
          appleIcon.href,
          ...manifest.icons.map((icon: { src: string }) => icon.src),
        ];
        return Promise.all(
          paths.map(async (path) =>
            (await fetch(path)).headers.get("content-type"),
          ),
        );
      });
      expect(icons).toHaveLength(5);
      expect(icons[0]).toMatch(/^image\/.*icon/);
      expect(icons.slice(1)).toEqual(Array<string>(4).fill("image/png"));
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
