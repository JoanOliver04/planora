// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getClaims: vi.fn(),
  limit: vi.fn(),
  deleteUser: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser, getClaims: mocks.getClaims },
  }),
}));
vi.mock("@/lib/security/distributed-rate-limit", () => ({
  distributedRateLimit: mocks.limit,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { admin: { deleteUser: mocks.deleteUser } } }),
}));
const { DELETE } = await import("@/app/api/account/route");
const request = (origin = "https://planora.app") =>
  new Request("https://planora.app/api/account", {
    method: "DELETE",
    headers: { origin, "x-planora-confirm": "delete-account" },
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "local-unit-test-placeholder");
  mocks.getUser.mockResolvedValue({ data: { user: { id: "owner" } } });
  mocks.getClaims.mockResolvedValue({
    data: {
      claims: {
        sub: "owner",
        amr: [{ method: "oauth", timestamp: Math.floor(Date.now() / 1000) }],
      },
    },
    error: null,
  });
  mocks.limit.mockResolvedValue({ allowed: true, retryAfter: 0 });
  mocks.deleteUser.mockResolvedValue({ error: null });
});
describe("account deletion security", () => {
  it("rejects cross-origin requests before authentication", async () => {
    expect((await DELETE(request("https://attacker.invalid"))).status).toBe(
      403,
    );
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
  it("requires recent authentication and never deletes on a refreshed old session", async () => {
    mocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "owner",
          iat: Math.floor(Date.now() / 1000),
          amr: [
            {
              method: "oauth",
              timestamp: Math.floor(Date.now() / 1000) - 3600,
            },
          ],
        },
      },
      error: null,
    });
    const response = await DELETE(request());
    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("REAUTHENTICATION_REQUIRED");
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
  it("fails closed when verified claims belong to a different user", async () => {
    mocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "other",
          amr: [{ method: "oauth", timestamp: Math.floor(Date.now() / 1000) }],
        },
      },
      error: null,
    });
    expect((await DELETE(request())).status).toBe(401);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
  it("honors a denied limiter before using administration authority", async () => {
    mocks.limit.mockResolvedValue({ allowed: false, retryAfter: 60 });
    const response = await DELETE(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
  it("deletes only the authenticated user and clears cookies and local data", async () => {
    const response = await DELETE(request());
    expect(response.status).toBe(200);
    expect(mocks.deleteUser).toHaveBeenCalledExactlyOnceWith("owner");
    expect(response.headers.get("Clear-Site-Data")).toBe(
      '"cache", "cookies", "storage"',
    );
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
});
