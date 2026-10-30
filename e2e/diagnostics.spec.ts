import { expect, test } from "./fixtures";

test("browser diagnostics detect genuine errors and rejected promises", async ({
  page,
  browserDiagnostics,
}) => {
  browserDiagnostics.allowWindowError(/^QA uncaught control$/);
  browserDiagnostics.allowWindowError(/^QA rejection control$/);
  browserDiagnostics.allowConsoleError(/QA (uncaught|rejection) control/);
  await page.goto("/en/login");
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error("QA uncaught control");
    }, 0);
    setTimeout(() => {
      void Promise.reject(new Error("QA rejection control"));
    }, 0);
  });
  await expect
    .poll(() => browserDiagnostics.windowErrors().sort())
    .toEqual(["QA rejection control", "QA uncaught control"]);
});
