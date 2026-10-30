import { describe, expect, it } from "vitest";
import { isWebKitResourceDiagnostic } from "../e2e/browser-diagnostics";

const diagnostic = {
  name: "Fetch API cannot load http",
  message: "/127.0.0.1:3000/en/week?_rsc=test due to access control checks.",
  stack: "",
};
const origins = ["http://127.0.0.1:3000"];

describe("browser diagnostic classification", () => {
  it("records the known WebKit resource diagnostic separately", () => {
    expect(isWebKitResourceDiagnostic(diagnostic, "webkit", origins)).toBe(
      true,
    );
  });
  it("keeps Chromium errors as failures", () => {
    expect(isWebKitResourceDiagnostic(diagnostic, "chromium", origins)).toBe(
      false,
    );
  });
  it("keeps genuine JavaScript errors with a stack as failures", () => {
    expect(
      isWebKitResourceDiagnostic(
        { ...diagnostic, stack: "at application.js:1" },
        "webkit",
        origins,
      ),
    ).toBe(false);
  });
  it("keeps ordinary fetch exceptions as failures", () => {
    expect(
      isWebKitResourceDiagnostic(
        { name: "TypeError", message: "Load failed", stack: "" },
        "webkit",
        origins,
      ),
    ).toBe(false);
  });
  it("does not accept resource diagnostics for an unknown origin", () => {
    expect(
      isWebKitResourceDiagnostic(diagnostic, "webkit", [
        "https://other.invalid",
      ]),
    ).toBe(false);
  });
});
