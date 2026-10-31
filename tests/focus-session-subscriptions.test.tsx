import { act, cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import {
  FocusSessionProvider,
  useOptionalFocusSessionContext,
  useOptionalFocusSessionState,
} from "@/features/focus/focus-session-context";
import { createStartedSession } from "@/features/focus/state-machine";
import type { UseFocusSessionResult } from "@/features/focus/use-focus-session";

const mock = vi.hoisted(() => ({
  engine: null as UseFocusSessionResult | null,
}));
vi.mock("@/features/focus/use-focus-session", () => ({
  useFocusSession: () => mock.engine,
}));
vi.mock("@/features/focus/focus-sync-poll", () => ({
  fetchActiveFocusSessionFull: vi.fn().mockResolvedValue(null),
  reconcileFocusSessionFromServer: vi
    .fn()
    .mockResolvedValue({ changed: false }),
}));
vi.mock("@/features/focus/focus-sync", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createFocusSyncBus: () => ({
    clientId: "subscription-test",
    requestSync: vi.fn(),
    close: vi.fn(),
    publishSession: vi.fn(),
  }),
}));
afterEach(cleanup);

it("updates the clock without rerendering session-only consumers, then propagates status and end", async () => {
  const session = createStartedSession(
    { mode: "countdown", focusDurationSec: 1500, title: "Reading" },
    "test-user",
    {
      now: Date.now(),
      sessionId: "session",
      intervalId: "interval",
      createId: () => "id",
    },
  );
  mock.engine = {
    session,
    now: 0,
    takeover: vi.fn(),
  } as unknown as UseFocusSessionResult;
  let broadRenders = 0;
  let stateRenders = 0;
  function ClockSubscriber() {
    broadRenders++;
    const context = useOptionalFocusSessionContext();
    return <span data-testid="clock">{context?.engine.now}</span>;
  }
  function SessionSubscriber() {
    stateRenders++;
    const current = useOptionalFocusSessionState();
    return <span data-testid="status">{current?.status ?? "none"}</span>;
  }
  const children = (
    <>
      <ClockSubscriber />
      <SessionSubscriber />
    </>
  );
  const view = () => (
    <NextIntlClientProvider locale="en" messages={messages}>
      <FocusSessionProvider initialSession={session}>
        {children}
      </FocusSessionProvider>
    </NextIntlClientProvider>
  );
  const { rerender } = render(view());
  await act(async () => {});
  const initialBroad = broadRenders;
  const initialState = stateRenders;
  for (let tick = 1; tick <= 60; tick++) {
    mock.engine = { ...mock.engine!, now: tick * 1000 };
    rerender(view());
  }
  expect(screen.getByTestId("clock")).toHaveTextContent("60000");
  expect(broadRenders - initialBroad).toBe(60);
  expect(stateRenders - initialState).toBe(0);
  mock.engine = {
    ...mock.engine!,
    session: { ...session, status: "paused", revision: 2 },
  };
  rerender(view());
  expect(screen.getByTestId("status")).toHaveTextContent("paused");
  mock.engine = { ...mock.engine!, session: null };
  rerender(view());
  expect(screen.getByTestId("status")).toHaveTextContent("none");
});
