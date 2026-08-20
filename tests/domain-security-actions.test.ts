import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  rpc: vi.fn(),
  restoreAllowed: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/features/backup/restore-security", () => ({
  assertRestoreAllowed: async (userId: string) => {
    mocks.calls.push(`limit:${userId}`);
    return mocks.restoreAllowed(userId);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => {
        mocks.calls.push("auth");
        return { data: { user: { id: "user-1" } } };
      },
    },
    rpc: mocks.rpc,
  }),
}));

const { duplicateSchedule, restoreBackup } =
  await import("@/app/actions/domain");

describe("critical domain action boundaries", () => {
  beforeEach(() => {
    mocks.calls.length = 0;
    mocks.rpc.mockReset().mockResolvedValue({ data: null, error: null });
    mocks.restoreAllowed.mockReset().mockResolvedValue(undefined);
    mocks.revalidatePath.mockReset();
  });

  it("delegates schedule duplication to one atomic RPC", async () => {
    await duplicateSchedule("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", true);

    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("duplicate_schedule", {
      source_schedule_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      include_tasks: true,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/[locale]/(app)",
      "layout",
    );
  });

  it("authenticates and rate-limits before parsing a restore", async () => {
    await expect(restoreBackup("not-a-backup")).rejects.toThrow(
      "Invalid or incompatible backup",
    );

    expect(mocks.calls).toEqual(["auth", "limit:user-1"]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("stops restore parsing when rate limiting fails", async () => {
    mocks.restoreAllowed.mockRejectedValue(new Error("rate limited"));

    await expect(restoreBackup("not-a-backup")).rejects.toThrow("rate limited");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
