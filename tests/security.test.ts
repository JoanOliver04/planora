import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/security/redirect";

describe("safeRedirectPath", () => {
  it("allows internal paths with query strings", () => {
    expect(safeRedirectPath("/en/today?view=week", "/fallback")).toBe(
      "/en/today?view=week",
    );
  });

  it.each([
    "https://evil.example/path",
    "//evil.example/path",
    "/\\evil.example/path",
    "\\\\evil.example/path",
    "/path\nSet-Cookie: injected=true",
  ])("rejects unsafe redirect %s", (value) => {
    expect(safeRedirectPath(value, "/fallback")).toBe("/fallback");
  });
});
