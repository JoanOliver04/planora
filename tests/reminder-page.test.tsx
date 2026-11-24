import { afterEach, describe, expect, it, vi } from "vitest";
import RemindersPage from "@/app/[locale]/(app)/reminders/page";

const state = vi.hoisted(() => {
  const state = {
    timezone: "UTC",
    gte: vi.fn(),
    page: vi.fn<
      (
        table: string,
        from: number,
        to: number,
      ) => { data: unknown[] | null; error: { message: string } | null }
    >(),
  };
  const from = (table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      is: () => query,
      order: () => query,
      gte: (field: string, value: string) => {
        state.gte(field, value);
        return query;
      },
      single: async () => ({
        data: { timezone: state.timezone, active_schedule_id: null },
        error: null,
      }),
      range: (from: number, to: number) =>
        Promise.resolve(
          state.page(table, from, to) ?? { data: [], error: null },
        ),
    };
    return query;
  };
  return Object.assign(state, { from });
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "qa-user" } } }) },
    from: state.from,
  }),
}));
vi.mock("@/features/reminders/reminder-center", () => ({
  ReminderCenter: () => null,
}));

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  state.page.mockReset();
});
describe("reminder event dates", () => {
  it("loads the next page of future events and exposes a separate reminder read failure", async () => {
    state.page.mockImplementation((table, from) => {
      if (table === "reminders")
        return { data: null, error: { message: "temporarily unavailable" } };
      if (table === "events")
        return {
          data: Array.from({ length: from === 0 ? 1000 : 1 }, (_, i) => ({
            id: String(from + i),
          })),
          error: null,
        };
      return { data: [], error: null };
    });
    const page = await RemindersPage({
      params: Promise.resolve({ locale: "es" }),
    });
    expect(page?.props.remindersLoadError).toBe(true);
    expect(page?.props.eventLoadError).toBe(false);
    expect(page?.props.events).toHaveLength(1001);
    expect(state.page).toHaveBeenCalledWith("events", 1000, 1999);
  });
  it.each([
    ["America/Los_Angeles", "2026-10-31T00:30:00Z", "2026-10-30"],
    ["Europe/Madrid", "2026-10-30T23:30:00Z", "2026-10-31"],
    ["UTC", "2026-10-30T12:00:00Z", "2026-10-30"],
  ])(
    "loads today's events in the profile timezone: %s",
    async (timezone, instant, expected) => {
      state.timezone = timezone;
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(instant));
      await RemindersPage({ params: Promise.resolve({ locale: "en" }) });
      expect(state.gte).toHaveBeenCalledWith("event_date", expected);
    },
  );
});
