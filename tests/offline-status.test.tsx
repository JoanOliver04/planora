import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OfflineStatus } from "@/components/offline-status";
import { createClient } from "@/lib/supabase/client";
import {
  enqueueCompletion,
  flushCompletionQueue,
  completionQueueKey,
} from "@/lib/offline/queue";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/offline/queue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/offline/queue")>()),
  flushCompletionQueue: vi.fn(),
}));
const getSession = vi.fn();
const change = {
  userId: "owner",
  taskId: "task",
  occurrenceDate: "2026-08-01",
  completed: true,
  snapshot: {},
};
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  getSession
    .mockReset()
    .mockResolvedValue({ data: { session: { user: { id: "owner" } } } });
  vi.mocked(createClient).mockReturnValue({
    auth: { getSession },
  } as unknown as ReturnType<typeof createClient>);
  vi.mocked(flushCompletionQueue).mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("does not read auth for another account's pending changes", async () => {
  await enqueueCompletion({ ...change, userId: "someone-else" });
  render(<OfflineStatus locale="es" userId="owner" />);
  await act(async () => {});
  expect(getSession).not.toHaveBeenCalled();
  expect(screen.queryByRole("status")).toBeNull();
});
it("coalesces queue notifications and retries transient failures until the queue clears", async () => {
  await enqueueCompletion(change);
  vi.mocked(flushCompletionQueue)
    .mockRejectedValueOnce(new Error("offline"))
    .mockImplementationOnce(async () => {
      localStorage.setItem(completionQueueKey, "[]");
      return { synced: 1, conflicts: 0, remaining: 0 };
    });
  render(<OfflineStatus locale="es" userId="owner" />);
  await act(async () => {
    window.dispatchEvent(new Event("planora-offline-queue"));
    window.dispatchEvent(new Event("planora-offline-queue"));
  });
  expect(flushCompletionQueue).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("status")).toHaveTextContent("1 cambio pendiente");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(flushCompletionQueue).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("status")).toBeNull();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(120000);
  });
  expect(getSession).toHaveBeenCalledTimes(2);
});
