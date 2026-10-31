import { test as base, expect } from "@playwright/test";
import {
  installBrowserErrorCapture,
  isBrowserCleanup,
  type BrowserErrorRecord,
} from "./browser-diagnostics";

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
  /^Failed to load resource: (net::ERR_(INTERNET_DISCONNECTED|FAILED)|The Internet connection appears to be offline\.|WebKit encountered an internal error)/;

export const test = base.extend<{
  browserDiagnostics: {
    allowConsoleError: (pattern: RegExp) => void;
    allowWindowError: (pattern: RegExp) => void;
    windowErrors: () => string[];
  };
}>({
  browserDiagnostics: [
    async ({ page }, use, testInfo) => {
      const exceptions: string[] = [];
      const consoleErrors: string[] = [];
      const serverErrors: string[] = [];
      const expectedConsoleErrors: RegExp[] = [];
      const expectedWindowErrors: RegExp[] = [];
      const resourceDiagnostics: string[] = [];
      const failedRequests: Array<{ path: string; error: string; at: number }> =
        [];
      const consoleLocations: Array<{
        path: string;
        line: number;
        at: number;
      }> = [];
      const cleanupDiagnostics: Array<{ kind: string; message: string }> = [];
      const errorDetails: Array<{
        name: string;
        message: string;
        stack?: string;
      }> = [];
      await page.exposeBinding(
        "__planoraQaError",
        (_source, record: BrowserErrorRecord) => {
          if (isBrowserCleanup(page)) {
            cleanupDiagnostics.push({
              kind: record.kind,
              message: redact(record.message),
            });
            return;
          }
          exceptions.push(redact(record.message));
          errorDetails.push({
            name: redact(record.name),
            message: redact(record.message),
            stack: redact(record.stack ?? ""),
          });
        },
      );
      await page.addInitScript(installBrowserErrorCapture);
      page.on("pageerror", (error) => {
        resourceDiagnostics.push(redact(`${error.name}: ${error.message}`));
      });
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        const location = message.location();
        consoleLocations.push({
          path: redact(location.url),
          line: location.lineNumber,
          at: Date.now(),
        });
        const text = redact(message.text()).slice(0, 800);
        if (isBrowserCleanup(page))
          cleanupDiagnostics.push({ kind: "console", message: text });
        else consoleErrors.push(text);
      });
      page.on("requestfailed", (request) => {
        const url = new URL(request.url());
        failedRequests.push({
          path: redact(url.origin + url.pathname),
          error: request.failure()?.errorText ?? "unknown",
          at: Date.now(),
        });
      });
      page.on("response", (response) => {
        if (response.status() < 500) return;
        const message = `${response.status()} ${new URL(response.url()).pathname}`;
        if (isBrowserCleanup(page))
          cleanupDiagnostics.push({ kind: "response", message });
        else serverErrors.push(message);
      });
      await use({
        allowConsoleError: (pattern) => expectedConsoleErrors.push(pattern),
        allowWindowError: (pattern) => expectedWindowErrors.push(pattern),
        windowErrors: () => [...exceptions],
      });
      if (testInfo.status === "skipped") return;
      await page.evaluate(() => Promise.resolve()).catch(() => undefined);
      const unexpectedConsoleErrors = consoleErrors.filter(
        (message) =>
          !expectedConsoleErrors.some((pattern) => pattern.test(message)),
      );
      const unexpectedWindowErrors = exceptions.filter(
        (message) =>
          !expectedWindowErrors.some((pattern) => pattern.test(message)),
      );
      if (
        testInfo.status !== testInfo.expectedStatus ||
        unexpectedWindowErrors.length ||
        unexpectedConsoleErrors.length ||
        serverErrors.length
      ) {
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
            failedRequests,
            consoleLocations,
            errorDetails,
            cleanupDiagnostics,
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
            failedRequests,
            consoleLocations,
            errorDetails,
            cleanupDiagnostics,
          }),
        ),
        contentType: "application/json",
      });
      if (resourceDiagnostics.length)
        console.info(
          `Browser pageerror diagnostics: ${resourceDiagnostics.length}; window errors and unhandled rejections checked separately`,
        );
      if (cleanupDiagnostics.length)
        console.info(
          "Controlled browser shutdown diagnostics:",
          JSON.stringify(cleanupDiagnostics),
        );
      expect(unexpectedWindowErrors, "No unhandled browser exceptions").toEqual(
        [],
      );
      expect(serverErrors, "No HTTP 5xx responses").toEqual([]);
      expect(
        unexpectedConsoleErrors,
        "No unexpected browser console errors",
      ).toEqual([]);
    },
    { auto: true },
  ],
});
