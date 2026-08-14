import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/security/redirect";
import {
  exceedsContentLength,
  hasJsonContentType,
  isSameOriginRequest,
} from "@/lib/security/request";
import { isPrivateAppPath } from "@/lib/security/routes";
import { contentSecurityPolicy } from "@/lib/security/csp";

describe("security boundaries", () => {
  it("allows internal redirect paths with query strings", () => {
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

  it("validates request origin, content type and bounded payloads", () => {
    const request = new Request("https://planora.app/api/telemetry", {
      method: "POST",
      headers: {
        origin: "https://planora.app",
        "content-type": "application/json; charset=utf-8",
        "content-length": "4097",
      },
    });
    expect(isSameOriginRequest(request)).toBe(true);
    expect(hasJsonContentType(request)).toBe(true);
    expect(exceedsContentLength(request, 4096)).toBe(true);
    expect(
      isSameOriginRequest(
        new Request("https://planora.app/api/telemetry", {
          headers: { origin: "https://evil.example" },
        }),
      ),
    ).toBe(false);
  });

  it("marks every authenticated workspace route as private", () => {
    expect(isPrivateAppPath("/es/today")).toBe(true);
    expect(isPrivateAppPath("/en/data")).toBe(true);
    expect(isPrivateAppPath("/es/tasks/new")).toBe(true);
    expect(isPrivateAppPath("/es/focus")).toBe(true);
    expect(isPrivateAppPath("/en/focus")).toBe(true);
    expect(isPrivateAppPath("/es/privacy")).toBe(false);
    expect(isPrivateAppPath("/en/demo/today")).toBe(false);
  });

  it("blocks script attributes and limits executable scripts to the app", () => {
    const policy = contentSecurityPolicy();
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("script-src-attr 'none'");
    expect(policy).not.toContain("https: 'unsafe-inline'");
  });
});
