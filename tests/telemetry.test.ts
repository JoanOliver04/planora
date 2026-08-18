import { describe, expect, it } from "vitest";
import { sanitizeTelemetry } from "@/lib/telemetry/sanitize";
import { rateLimit, unavailableLimit } from "@/lib/security/rate-limit";
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

  it("denies sensitive limits when distributed storage is unavailable", () => {
    expect(unavailableLimit("deny", "missing", 3, 1000).allowed).toBe(false);
    expect(
      unavailableLimit("memory", crypto.randomUUID(), 1, 60_000).allowed,
    ).toBe(true);
  });
});
