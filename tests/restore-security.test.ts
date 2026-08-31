import { readFileSync } from "node:fs";
import { join } from "node:path";
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

  it("revokes restore_core from authenticated and rate-limits in SQL", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260831190000_restore_rpc_hardening.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("restore_planora_backup_core");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("assert_restore_rate_limit");
    expect(sql).toContain("octet_length");
    expect(sql).toContain("to service_role");
  });
});
