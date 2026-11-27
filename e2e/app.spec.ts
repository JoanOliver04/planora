import { expect, offlineNetworkError, test } from "./fixtures";

test("demo starts light and remembers its own theme across routes and languages", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const expectTheme = expect.configure({ timeout: 25_000 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/es");
  const html = page.locator("html");
  await expectTheme(html).toHaveCSS("color-scheme", "dark");
  await page.getByRole("link", { name: "Probar demo gratis" }).first().click();
  await expectTheme(html).toHaveCSS("color-scheme", "light");

  await page.goto("/es/demo/settings");
  const picker = page.getByRole("combobox", { name: "Tema de la demo" });
  await expectTheme(picker).toHaveValue("light");
  await picker.selectOption("dark");
  await expectTheme(html).toHaveCSS("color-scheme", "dark");
  await page.reload();
  await expectTheme(picker).toHaveValue("dark");
  await page.goto("/en/demo/settings");
  const englishPicker = page.getByRole("combobox", { name: "Demo theme" });
  await expectTheme(englishPicker).toHaveValue("dark");

  await englishPicker.selectOption("system");
  await page.emulateMedia({ colorScheme: "light" });
  await expectTheme(html).toHaveCSS("color-scheme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expectTheme(html).toHaveCSS("color-scheme", "dark");

  await page.getByRole("button", { name: "Reset demo" }).click();
  await expectTheme(englishPicker).toHaveValue("light");
  await page.getByRole("link", { name: "Privacy policy", exact: true }).click();
  await expectTheme(html).toHaveCSS("color-scheme", "dark");
  expect(
    await page.evaluate(() => localStorage.getItem("planora-theme")),
  ).toBeNull();
});
test("public landing exposes product and conversion paths", async ({
  page,
}) => {
  await page.goto("/es");
  await expect(
    page.getByRole("heading", { name: /Haz sitio en tu día/i }),
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
    page.getByRole("heading", { name: /Make room in your day/i }),
  ).toBeVisible();
});
test("PWA shell and connection status work offline", async ({
  page,
  context,
  browserName,
  browserDiagnostics,
}) => {
  browserDiagnostics.allowConsoleError(offlineNetworkError);
  await page.goto("/es");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  // Wait for the public providers to mount before disconnecting the browser.
  await page.waitForFunction(() =>
    Boolean(document.documentElement.style.colorScheme),
  );
  await context.setOffline(true);
  try {
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(page.getByText("Sin conexión")).toBeVisible();
    if (browserName === "chromium") {
      await page.reload();
      await expect(
        page.getByRole("heading", { name: /Haz sitio en tu día/i }),
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
  await expect(page).toHaveURL(/\/es\/demo\/today/, { timeout: 25_000 });
  const task = page.getByRole("button", {
    name: /Revisar prioridades del día/,
  });
  await task.click();
  await expect(task).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.locator("main")).toHaveAttribute("aria-busy", "false", {
    timeout: 25_000,
  });
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

test("the demo enables its controls after startup when browser storage is blocked", async ({
  page,
  browser,
  baseURL,
}) => {
  const initial = await browser.newPage({ baseURL, javaScriptEnabled: false });
  try {
    await initial.goto("/es/demo/focus");
    await expect(
      initial.getByRole("button", { name: "Iniciar", exact: true }),
    ).toBeDisabled();
  } finally {
    await initial.close();
  }
  await page.addInitScript(() => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      if (key === "planora-demo-v1")
        throw new DOMException("Storage blocked", "SecurityError");
      return original.call(this, key);
    };
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "planora-demo-v1")
        throw new DOMException("Storage blocked", "SecurityError");
      write.call(this, key, value);
    };
  });
  await page.goto("/es/demo/focus");
  await page.getByRole("button", { name: "Iniciar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pausar" })).toBeVisible();
});

test("demo exposes the current product areas without registration", async ({
  page,
}) => {
  await page.goto("/es/demo/more");
  const main = page.locator("#main-content");
  await expect(main).toHaveAttribute("aria-busy", "false", { timeout: 25000 });
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
  await expect(page.getByText("00:15")).toBeVisible();
  await page.getByRole("button", { name: "25 min", exact: true }).click();
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

test("current demo areas remain responsive on narrow screens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  for (const area of [
    "month",
    "search",
    "focus",
    "statistics",
    "reminders",
    "templates",
    "data",
    "more",
  ]) {
    await page.goto(`/es/demo/${area}`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(new RegExp(`/es/demo/${area}(?:[/?#]|$)`));
    await expect(page.locator("#main-content")).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
      `Document overflow in demo/${area}`,
    ).toBe(true);
  }
  const monthCells = await page
    .goto("/es/demo/month")
    .then(() => page.locator(".demo-month-day").count());
  expect([28, 35, 42]).toContain(monthCells);
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
  const firstDayCell = page.locator(".week-grid .day").first();
  await expect(firstDayCell).toBeVisible();
  const firstDay = await firstDayCell.boundingBox();
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

test("visitors can plan a task, focus on it and see the result after a reload", async ({
  page,
}) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 60_000));
  await page.goto("/en");
  await page.getByRole("link", { name: "Try the free demo" }).first().click();
  await page
    .getByRole("textbox", { name: "Add task" })
    .fill("Review portfolio");
  await page.getByRole("button", { name: "Add to today" }).click();
  await page
    .getByRole("button", { name: /Mark as complete: Review portfolio/ })
    .click();
  await page.getByRole("link", { name: /Make time to focus/ }).click();
  await page
    .getByLabel("Linked task")
    .selectOption({ label: "✨ Review portfolio" });
  await page.getByRole("button", { name: "15 s preview" }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.reload();
  await expect(page.locator("main")).toHaveAttribute("aria-busy", "false", {
    timeout: 25000,
  });
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.clock.fastForward(16000);
  await page.getByRole("link", { name: /See my statistics/ }).click();
  const receipt = page.locator(".demo-session-receipt");
  await expect(receipt).toContainText("Review portfolio");
  await expect(receipt).toContainText("15 s");
  await expect(page.locator(".demo-stat-grid")).toContainText("100 min 15 s");
});

test("switching schedules updates today's count and the weekly agenda", async ({
  page,
}) => {
  await page.goto("/es/demo/schedules");
  await page
    .getByRole("article")
    .filter({ hasText: "Semana de enfoque" })
    .getByRole("button", { name: "Usar", exact: true })
    .click();
  await page.goto("/es/demo/today");
  await expect(page.locator(".demo-day-summary")).toContainText("0 / 1");
  await page
    .getByRole("button", { name: /Marcar como completada: Paseo sin móvil/ })
    .click();
  await expect(page.locator(".demo-day-summary")).toContainText("1 / 1");
  await page.goto("/es/demo/week");
  await expect(page.locator("main")).toHaveAttribute("aria-busy", "false", {
    timeout: 25000,
  });
  const week = page.getByRole("region", { name: "Semana" });
  await expect(week.getByText("🚶 Paseo sin móvil")).toHaveCount(7);
  const currentDate = await page.locator(".demo-week-tools b").textContent();
  await page.getByRole("button", { name: "Semana siguiente" }).click();
  await expect(page.locator(".demo-week-tools b")).not.toHaveText(currentDate!);
  await page.getByRole("button", { name: "Hoy", exact: true }).click();
  await expect(page.locator(".demo-week-tools b")).toHaveText(currentDate!);
});
