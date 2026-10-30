// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  exceedsContentLength,
  hasJsonContentType,
  isSameOriginRequest,
  readBoundedText,
} from "@/lib/security/request";
import { hasRecentAuthentication } from "@/lib/security/recent-auth";
import { validatePublicConfiguration } from "@/lib/security/public-config";

describe("request security", () => {
  it.each(["application/jsonp", "application/json-invalid", "text/plain"])(
    "rejects misleading media type %s",
    (type) => {
      expect(
        hasJsonContentType(
          new Request("https://planora.app", {
            headers: { "content-type": type },
          }),
        ),
      ).toBe(false);
    },
  );
  it.each(["-1", "1.2", "1e3", "+10", "NaN"])(
    "rejects invalid length %s",
    (length) => {
      expect(
        exceedsContentLength(
          new Request("https://planora.app", {
            headers: { "content-length": length },
          }),
          4096,
        ),
      ).toBe(true);
    },
  );
  it("rejects origin URLs with paths and cross-site Fetch Metadata", () => {
    for (const headers of [
      { origin: "https://planora.app/path" },
      { origin: "https://planora.app", "sec-fetch-site": "cross-site" },
    ] as Record<string, string>[])
      expect(
        isSameOriginRequest(new Request("https://planora.app", { headers })),
      ).toBe(false);
  });
  it("accepts bounded chunked bodies without requiring content-length", async () => {
    expect(
      await readBoundedText(
        new Request("https://planora.app", {
          method: "POST",
          body: '{"ok":true}',
        }),
        32,
      ),
    ).toBe('{"ok":true}');
  });
  it("counts UTF-8 bytes instead of JS characters even when declared length lies", async () => {
    expect(
      await readBoundedText(
        new Request("https://planora.app", {
          method: "POST",
          headers: { "content-length": "1" },
          body: "😀😀",
        }),
        4,
      ),
    ).toBeNull();
  });
  it("stops and cancels a stream as soon as its byte budget is exceeded", async () => {
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(4097));
      },
      cancel() {
        canceled = true;
      },
    });
    const request = new Request("https://planora.app", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit);
    expect(await readBoundedText(request, 4096)).toBeNull();
    expect(canceled).toBe(true);
  });
});

describe("recent authentication", () => {
  const now = 1_800_000_000_000;
  it("requires authentication proof for the verified user", () => {
    const claims = {
      sub: "owner",
      amr: [{ method: "oauth", timestamp: now / 1000 - 60 }],
    };
    expect(hasRecentAuthentication(claims, "owner", now)).toBe(true);
    expect(hasRecentAuthentication(claims, "other", now)).toBe(false);
  });
  it("does not treat a fresh token issued from old authentication as reauthentication", () => {
    expect(
      hasRecentAuthentication(
        {
          sub: "owner",
          amr: [{ method: "oauth", timestamp: now / 1000 - 3600 }],
          iat: now / 1000,
        } as { sub: string; amr: unknown },
        "owner",
        now,
      ),
    ).toBe(false);
  });
  it("fails closed for missing, future or unrecognized authentication methods", () => {
    for (const amr of [
      undefined,
      [],
      [{ method: "oauth", timestamp: now / 1000 + 120 }],
      [{ method: "token_refresh", timestamp: now / 1000 }],
      [{ method: "oauth", timestamp: "1800000000" }],
    ])
      expect(hasRecentAuthentication({ sub: "owner", amr }, "owner", now)).toBe(
        false,
      );
  });
});

describe("public configuration", () => {
  it("supports HTTPS deployments and HTTP loopback integration environments", () => {
    expect(() =>
      validatePublicConfiguration({
        NEXT_PUBLIC_SITE_URL: "https://planora.app",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      }),
    ).not.toThrow();
  });
  it.each([
    "http://production.example",
    "https://name:password@production.example",
    "https://planora.app/path",
    "javascript:alert(1)",
  ])("rejects unsafe configured origin %s", (value) => {
    expect(() =>
      validatePublicConfiguration({ NEXT_PUBLIC_SITE_URL: value }),
    ).toThrow();
  });
  it("refuses secret keys and legacy service-role JWTs in public build variables", () => {
    const jwt = `header.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`;
    for (const key of ["sb_secret_example", jwt]) {
      expect(() =>
        validatePublicConfiguration({
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
        }),
      ).toThrow(/privileged/);
      try {
        validatePublicConfiguration({
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
        });
      } catch (error) {
        expect(String(error)).not.toContain(key);
      }
    }
  });
  it("rejects whitespace that could hide a privileged key prefix", () => {
    expect(() =>
      validatePublicConfiguration({
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: " sb_secret_placeholder ",
      }),
    ).toThrow();
    expect(() =>
      validatePublicConfiguration({
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "same-value",
        SUPABASE_SERVICE_ROLE_KEY: " same-value ",
      }),
    ).toThrow();
  });
});
