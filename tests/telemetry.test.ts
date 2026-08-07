import { describe, expect, it } from "vitest";
import { sanitizeTelemetry } from "@/lib/telemetry/sanitize";
import { rateLimit } from "@/lib/security/rate-limit";
describe("production safeguards", () => {
  it("redacts sensitive keys and email addresses", () => {
    expect(
      sanitizeTelemetry({ token: "abc", detail: "mail me@example.com" }),
    ).toEqual({ token: "[redacted]", detail: "mail [email]" });
  });
  it("limits repeated requests", () => {
    const key = crypto.randomUUID();
    expect(rateLimit(key, 1).allowed).toBe(true);
    expect(rateLimit(key, 1).allowed).toBe(false);
  });
});
