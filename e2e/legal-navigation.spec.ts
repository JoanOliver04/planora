import { expect, test } from "./fixtures";
import { hasLocalCredentials, withLocalWorkspace } from "./local-workspace";

const locales = [
  {
    locale: "es",
    settings: "Ajustes",
    privacy: "Privacidad",
    terms: "Condiciones de uso",
  },
  {
    locale: "en",
    settings: "Settings",
    privacy: "Privacy",
    terms: "Terms of use",
  },
] as const;

test("legal pages return to the signed-in settings after a reload", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(120_000);
  test.skip(!hasLocalCredentials, "Disposable local account required");
  const documents: Array<{ path: string; policy: string }> = [];
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (response.request().isNavigationRequest() && path.endsWith("/settings"))
      documents.push({
        path,
        policy: response.headers()["content-security-policy"] ?? "",
      });
  });
  await withLocalWorkspace(context, baseURL, async (db, userId) => {
    const account = await db.auth.getUser();
    expect(account.error).toBeNull();
    const email = account.data.user!.email!;
    for (const copy of locales) {
      expect(
        (
          await db
            .from("profiles")
            .update({ locale: copy.locale })
            .eq("id", userId)
        ).error,
      ).toBeNull();
      const settings = `/${copy.locale}/settings`;
      await page.goto(settings);
      for (const route of ["privacy", "terms"] as const) {
        await expect(
          page.getByRole("heading", { name: copy.settings, exact: true }),
        ).toBeVisible({ timeout: 15_000 });
        await page
          .locator(".app-about")
          .getByRole("link", { name: copy[route], exact: true })
          .click();
        await expect(
          page.getByRole("heading", { name: copy[route], exact: true }),
        ).toBeVisible();
        await page.reload();
        const beforeReturn = documents.length;
        await page
          .getByRole("link", { name: "← Planora", exact: true })
          .click();
        await expect(page).toHaveURL(baseURL + settings);
        await expect(
          page.getByRole("heading", { name: copy.settings, exact: true }),
        ).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText(email, { exact: true })).toBeVisible();
        expect(documents).toHaveLength(beforeReturn + 1);
        expect(documents.at(-1)?.path).toBe(settings);
        expect(documents.at(-1)?.policy).toContain("'nonce-");
      }
    }
  });
});

test("legal pages preserve public and demo return destinations", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(90_000);
  for (const copy of locales) {
    for (const route of ["privacy", "terms"] as const) {
      await page.goto(`/${copy.locale}/${route}`);
      await page.getByRole("link", { name: "← Planora", exact: true }).click();
      await expect(page).toHaveURL(`${baseURL}/${copy.locale}`);
      await page.goto(`/${copy.locale}/demo/settings`);
      await page
        .locator(".app-about")
        .getByRole("link", { name: copy[route], exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: copy[route], exact: true }),
      ).toBeVisible();
      await page.reload();
      await page.getByRole("link", { name: "← Planora", exact: true }).click();
      await expect(page).toHaveURL(`${baseURL}/${copy.locale}/demo/settings`);
      await expect(
        page.getByRole("heading", { name: copy.settings, exact: true }),
      ).toBeVisible();
    }
  }
  await page.goto("/en/privacy?from=https%3A%2F%2Fexample.com");
  await page.getByRole("link", { name: "← Planora", exact: true }).click();
  await expect(page).toHaveURL(`${baseURL}/en`);
});
