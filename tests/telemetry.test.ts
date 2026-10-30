import { describe, expect, it } from "vitest";
import {
  sanitizeTelemetry,
  sanitizeErrorEvent,
} from "@/lib/telemetry/sanitize";
import { rateLimit, unavailableLimit } from "@/lib/security/rate-limit";
describe("production safeguards", () => {
  it("logs only known technical error metadata and canonical routes", () => {
    const raw = {
      path: "/es/tasks/private-name?token=secret",
      message: "private notes",
      context: {
        phase: "auth",
        errorType: "TypeError",
        code: "my-private-title",
        other: "secret",
        digest: "12345",
        online: false,
      },
    };
    expect(sanitizeErrorEvent(raw)).toEqual({
      type: "error",
      path: "/es/tasks",
      context: {
        phase: "auth",
        errorType: "TypeError",
        digest: "12345",
        online: false,
      },
    });
    expect(JSON.stringify(sanitizeErrorEvent(raw))).not.toMatch(
      /private|secret/,
    );
    expect(sanitizeErrorEvent({ path: "/private-user-name" }).path).toBe(
      "/other",
    );
  });
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
