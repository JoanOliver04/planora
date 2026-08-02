import { loadEnvConfig } from "@next/env";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "../src/types/database";

loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

test("mobile More navigation reaches every secondary area naturally", async ({
  page,
  context,
}) => {
  test.skip(
    !url || !anonKey || !serviceKey,
    "Supabase integration credentials required",
  );
  const admin = createClient<Database>(url!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = `navigation-e2e-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const password = `Planora-${crypto.randomUUID()}!`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expect(created.error).toBeNull();
  const userId = created.data.user!.id;

  try {
    const authClient = createClient<Database>(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const link = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    expect(link.error).toBeNull();
    const verified = await authClient.auth.verifyOtp({
      token_hash: link.data.properties!.hashed_token,
      type: "email",
    });
    expect(verified.error).toBeNull();
    expect(verified.data.session).not.toBeNull();
    const preparedProfile = await authClient.rpc("complete_onboarding", {
      include_starters: false,
      detected_timezone: "Europe/Madrid",
    });
    expect(preparedProfile.error).toBeNull();

    let cookieJar: Array<{ name: string; value: string }> = [];
    const ssr = createServerClient<Database>(url!, anonKey!, {
      cookies: {
        getAll: () => cookieJar,
        setAll: (values) => {
          for (const value of values) {
            cookieJar = cookieJar.filter(
              (cookie) => cookie.name !== value.name,
            );
            cookieJar.push({ name: value.name, value: value.value });
          }
        },
      },
    });
    expect(
      (
        await ssr.auth.setSession({
          access_token: verified.data.session!.access_token,
          refresh_token: verified.data.session!.refresh_token,
        })
      ).error,
    ).toBeNull();
    await context.addCookies(
      cookieJar.map((cookie) => ({
        ...cookie,
        url: "http://127.0.0.1:3000",
      })),
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/es/more");

    const bottomNav = page.locator(".mobile-nav");
    const moreTab = bottomNav.getByRole("link", { name: "Más" });
    await expect(bottomNav.getByRole("link")).toHaveCount(5);
    await expect(moreTab).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("heading", { name: "Más", level: 1 }),
    ).toBeVisible();

    const secondaryLabels = [
      "Historial",
      "Estadísticas",
      "Recordatorios",
      "Horarios",
      "Categorías",
      "Plantillas",
      "Ajustes",
      "Tus datos",
    ];
    for (const label of secondaryLabels)
      await expect(
        page.locator("main").getByRole("link", { name: new RegExp(label) }),
      ).toBeVisible();

    await page
      .locator("main")
      .getByRole("link", { name: /Estadísticas/ })
      .click();
    await expect(
      page.getByRole("heading", { name: "Estadísticas", level: 1 }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(moreTab).toHaveAttribute("aria-current", "page");
    await page.goBack();
    await expect(page).toHaveURL(/\/es\/more$/);

    await page
      .locator("main")
      .getByRole("link", { name: /Recordatorios/ })
      .click();
    await expect(
      page.getByRole("heading", { name: /Notificaciones y alarmas/ }),
    ).toBeVisible();
    await expect(moreTab).toHaveAttribute("aria-current", "page");
    await page.goBack();

    await page
      .locator("main")
      .getByRole("link", { name: /Tus datos/ })
      .click();
    await expect(
      page.getByRole("heading", { name: "Tus datos", level: 1 }),
    ).toBeVisible();
    await expect(moreTab).toHaveAttribute("aria-current", "page");
    await page.goBack();

    for (const viewport of [
      { width: 320, height: 568 },
      { width: 375, height: 667 },
      { width: 390, height: 844 },
      { width: 412, height: 915 },
      { width: 768, height: 1024 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/es/more");
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      ).toBe(true);
      const dataLink = page
        .locator("main")
        .getByRole("link", { name: /Tus datos/ });
      await dataLink.evaluate((element) =>
        element.scrollIntoView({ block: "center" }),
      );
      await expect(dataLink).toBeVisible();
      const dataBox = await dataLink.boundingBox();
      const navBox = await bottomNav.boundingBox();
      expect((dataBox?.y ?? 0) + (dataBox?.height ?? 0)).toBeLessThanOrEqual(
        navBox?.y ?? viewport.height,
      );
    }

    await page.goto("/en/more");
    await expect(
      page.getByRole("heading", { name: "More", level: 1 }),
    ).toBeVisible();
    await expect(
      page.locator("main").getByRole("link", { name: /Your data/ }),
    ).toBeVisible();
    await expect(bottomNav.getByRole("link", { name: "More" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
});
