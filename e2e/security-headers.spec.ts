import { expect, test } from "@playwright/test";

test("login hydrates with nonce scripts and blocks injected inline scripts", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto("/es/login");
  const policy = response?.headers()["content-security-policy"] ?? "";
  const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();
  expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await expect(page.getByRole("button", { name: /Google/i })).toBeVisible();
  const inlineNonces = await page
    .locator("script:not([src])")
    .evaluateAll((scripts) =>
      scripts
        .filter((s) => s.textContent?.trim())
        .map((s) => (s as HTMLScriptElement).nonce),
    );
  expect(inlineNonces.length).toBeGreaterThan(0);
  expect(inlineNonces.every((value) => value === nonce)).toBe(true);
  await page.evaluate(() => {
    const script = document.createElement("script");
    script.textContent = "window.__planoraInjected = true";
    document.body.append(script);
  });
  expect(
    await page.evaluate(
      () =>
        (window as Window & { __planoraInjected?: boolean }).__planoraInjected,
    ),
  ).toBeUndefined();
  await page.getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en\/login/);
  expect(errors).toEqual([]);
  const second = await page.goto("/es/login");
  const nextNonce = second
    ?.headers()
    ["content-security-policy"]?.match(/'nonce-([^']+)'/)?.[1];
  expect(nextNonce).toBeTruthy();
  expect(nextNonce).not.toBe(nonce);
});

test("private requests are never cacheable and APIs reject cross-origin writes", async ({
  request,
}) => {
  const response = await request.get("/es/today", { maxRedirects: 0 });
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  const deletion = await request.delete("/api/account", {
    headers: {
      origin: "https://external.invalid",
      "x-planora-confirm": "delete-account",
    },
  });
  expect(deletion.status()).toBe(403);
  const telemetry = await request.post("/api/telemetry", {
    headers: { origin: "https://external.invalid" },
    data: { type: "error", path: "/" },
  });
  expect(telemetry.status()).toBe(403);
});

test("entering login from public pages installs a new document policy", async ({
  page,
}) => {
  for (const route of ["/es", "/es/demo/today"]) {
    await page.goto(route);
    const navigation = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/es/login" &&
        response.request().isNavigationRequest(),
    );
    await page
      .getByRole("link", {
        name:
          route === "/es"
            ? /Continuar con Google/i
            : /Crear mi cuenta|Create my account/i,
      })
      .first()
      .click();
    const response = await navigation;
    expect(response.headers()["content-security-policy"]).toMatch(/'nonce-/);
    expect(response.headers()["content-security-policy"]).not.toMatch(
      /script-src[^;]*'unsafe-inline'/,
    );
    await expect(page.getByRole("button", { name: /Google/i })).toBeVisible();
  }
});
