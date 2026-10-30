import { test as base, expect } from "@playwright/test";
import { isWebKitResourceDiagnostic } from "./browser-diagnostics";

function redact(value: string) {
  return value
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "<token>")
    .replace(/sb_(?:secret|publishable)_[\w-]+/g, "<key>")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "<email>")
    .replace(/[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}/gi, "<id>")
    .replace(/https?:\/\/[^\s)]+/g, (value) => {
      try {
        const url = new URL(value);
        return url.origin + url.pathname;
      } catch {
        return "<url>";
      }
    });
}

export { expect };
export const offlineNetworkError =
  /^Failed to load resource: (net::ERR_(INTERNET_DISCONNECTED|FAILED)|The Internet connection appears to be offline\.)/;

export const test = base.extend<{
  browserDiagnostics: { allowConsoleError: (pattern: RegExp) => void };
}>({
  browserDiagnostics: [
    async ({ page, browserName, baseURL }, use, testInfo) => {
      const exceptions: string[] = [];
      const consoleErrors: string[] = [];
      const serverErrors: string[] = [];
      const expectedConsoleErrors: RegExp[] = [];
      const resourceDiagnostics: string[] = [];
      const errorDetails: Array<{
        name: string;
        message: string;
        stack?: string;
      }> = [];
      const origins = [baseURL, process.env.NEXT_PUBLIC_SUPABASE_URL]
        .filter((value): value is string => Boolean(value))
        .map((value) => new URL(value).origin);
      page.on("pageerror", (error) => {
        if (isWebKitResourceDiagnostic(error, browserName, origins)) {
          resourceDiagnostics.push(redact(error.message));
          return;
        }
        exceptions.push(redact(error.message));
        errorDetails.push({
          name: redact(error.name),
          message: redact(error.message),
          stack: redact(error.stack ?? ""),
        });
      });
      page.on("console", (message) => {
        if (message.type() === "error")
          consoleErrors.push(redact(message.text()).slice(0, 800));
      });
      page.on("response", (response) => {
        if (response.status() >= 500)
          serverErrors.push(
            `${response.status()} ${new URL(response.url()).pathname}`,
          );
      });
      await use({
        allowConsoleError: (pattern) => expectedConsoleErrors.push(pattern),
      });
      if (testInfo.status === "skipped") return;
      if (testInfo.status !== testInfo.expectedStatus) {
        const text = await page
          .locator("body")
          .innerText({ timeout: 1000 })
          .catch(() => "Page unavailable");
        console.error("Browser failure context:", redact(text).slice(0, 4500));
        console.error(
          "Browser diagnostics:",
          JSON.stringify({
            exceptions,
            consoleErrors,
            serverErrors,
            resourceDiagnostics,
            errorDetails,
          }),
        );
      }
      await testInfo.attach("browser-diagnostics", {
        body: Buffer.from(
          JSON.stringify({
            exceptions,
            consoleErrors,
            serverErrors,
            resourceDiagnostics,
            errorDetails,
          }),
        ),
        contentType: "application/json",
      });
      if (resourceDiagnostics.length)
        console.info(
          `WebKit resource diagnostics: ${resourceDiagnostics.length}; retained separately from JavaScript exceptions`,
        );
      expect(exceptions, "No unhandled browser exceptions").toEqual([]);
      expect(serverErrors, "No HTTP 5xx responses").toEqual([]);
      expect(
        consoleErrors.filter(
          (message) =>
            !expectedConsoleErrors.some((pattern) => pattern.test(message)),
        ),
        "No unexpected browser console errors",
      ).toEqual([]);
    },
    { auto: true },
  ],
});
