import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, it, vi } from "vitest";
import { CalendarEventsStatus } from "@/features/workspace/calendar-events-status";
import messages from "@/messages/es.json";

afterEach(cleanup);

it("offers a retry after a failed range and cancels the pending request when leaving it", async () => {
  const load = vi
    .fn<(start: string, end: string, signal: AbortSignal) => Promise<boolean>>()
    .mockResolvedValueOnce(false)
    .mockImplementationOnce(() => new Promise(() => {}));
  const { unmount } = render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <CalendarEventsStatus start="2026-11-23" end="2026-11-29" load={load} />
    </NextIntlClientProvider>,
  );
  expect(
    await screen.findByText(messages.Workspace.calendarEventsError),
  ).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: messages.Workspace.retry }),
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    messages.Workspace.calendarEventsLoading,
  );
  expect(load).toHaveBeenCalledTimes(2);
  const [start, end, signal] = load.mock.calls[1];
  expect([start, end]).toEqual(["2026-11-23", "2026-11-29"]);
  expect(signal.aborted).toBe(false);
  unmount();
  expect(signal.aborted).toBe(true);
});
