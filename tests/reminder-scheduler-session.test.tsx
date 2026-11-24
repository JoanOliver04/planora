import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ReminderScheduler } from "@/components/reminder-scheduler";
import { createClient } from "@/lib/supabase/client";
import {
  activateClientSession,
  pausePrivatePolling,
} from "@/lib/security/client-session";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("@/i18n/routing", () => ({ useRouter: () => router }));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("aborts a reminder poll before sign-out and can resume after a failed sign-out", async () => {
  activateClientSession("scheduler-owner");
  const signals: AbortSignal[] = [];
  const replies: Array<
    (result: { data: { managed: boolean }; error: null }) => void
  > = [];
  const rpc = vi.fn(() => ({
    abortSignal: (signal: AbortSignal) => {
      signals.push(signal);
      return new Promise((resolve) => replies.push(resolve));
    },
  }));
  const from = vi.fn();
  vi.mocked(createClient).mockReturnValue({
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: "scheduler-owner" } } },
      }),
    },
    rpc,
    from,
  } as unknown as ReturnType<typeof createClient>);
  const view = render(
    <ReminderScheduler locale="en" userId="scheduler-owner" />,
  );
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
  });
  expect(rpc).toHaveBeenCalledTimes(1);
  const resume = pausePrivatePolling("scheduler-owner");
  expect(signals[0].aborted).toBe(true);
  await act(async () => {
    replies[0]({ data: { managed: false }, error: null });
    window.dispatchEvent(new Event("focus"));
  });
  expect(from).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledTimes(1);
  await act(async () => {
    resume();
  });
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(signals[1].aborted).toBe(false);
  view.unmount();
  expect(signals[1].aborted).toBe(true);
  replies[1]({ data: { managed: false }, error: null });
});
