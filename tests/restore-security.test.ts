import { beforeEach, describe, expect, it, vi } from "vitest";

const distributedRateLimit = vi.fn();
vi.mock("@/lib/security/distributed-rate-limit", () => ({
  distributedRateLimit,
}));

const { assertRestoreAllowed } =
  await import("@/features/backup/restore-security");

describe("backup restore abuse protection", () => {
  beforeEach(() => distributedRateLimit.mockReset());

  it("uses a fail-closed per-user distributed limit", async () => {
    distributedRateLimit.mockResolvedValue({ allowed: true, retryAfter: 0 });

    await expect(assertRestoreAllowed("user-1")).resolves.toBeUndefined();
    expect(distributedRateLimit).toHaveBeenCalledWith(
      "backup-restore:user-1",
      5,
      3_600_000,
      { fallback: "deny" },
    );
  });

  it("rejects exhausted restore budgets", async () => {
    distributedRateLimit.mockResolvedValue({
      allowed: false,
      retryAfter: 120,
    });

    await expect(assertRestoreAllowed("user-1")).rejects.toThrow(
      "Too many restore attempts",
    );
  });
});
