import { afterEach, describe, expect, it, vi } from "vitest";
import RemindersPage from "@/app/[locale]/(app)/reminders/page";

const state = vi.hoisted(() => {
  const state = { timezone: "UTC", gte: vi.fn() };
  const from = () => {
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
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: [], error: null } as {
          data: unknown[];
          error: null;
        }).then(resolve),
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
});
describe("reminder event dates", () => {
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
