import { describe, expect, it } from "vitest";
import {
  calculateWeeklyProgress,
  classifyDayPart,
  formatRecurrenceDescription,
  getExpectedTaskOccurrences,
  getWeekRange,
  isTaskExpectedOnDate,
} from "@/lib/recurrence";
import { recurrenceConfigSchema } from "@/lib/validation/task";
describe("recurrence", () => {
  it("supports daily bounds", () => {
    const t = {
      startDate: "2026-07-01",
      endDate: "2026-07-03",
      recurrence: { type: "daily" as const },
    };
    expect(
      getExpectedTaskOccurrences(t, "2026-06-30", "2026-07-04"),
    ).toHaveLength(3);
  });
  it("includes a task whose start and end are the same day", () => {
    const task = {
      startDate: "2026-08-02",
      endDate: "2026-08-02",
      recurrence: { type: "daily" as const },
    };

    expect(isTaskExpectedOnDate(task, "2026-08-02")).toBe(true);
    expect(isTaskExpectedOnDate(task, new Date("2026-08-02T12:00:00"))).toBe(
      true,
    );
    expect(isTaskExpectedOnDate(task, "2026-08-03")).toBe(false);
    expect(
      isTaskExpectedOnDate(
        { ...task, recurrence: { type: "once" as const } },
        new Date("2026-08-02T18:00:00"),
      ),
    ).toBe(true);
  });
  it("supports weekdays", () => {
    expect(
      isTaskExpectedOnDate(
        {
          startDate: "2026-07-01",
          recurrence: { type: "weekdays", weekdays: [1, 3] },
        },
        "2026-07-06",
      ),
    ).toBe(true);
  });
  it("supports n-day intervals", () => {
    expect(
      isTaskExpectedOnDate(
        {
          startDate: "2026-07-01",
          recurrence: { type: "interval", every: 2, unit: "day" },
        },
        "2026-07-05",
      ),
    ).toBe(true);
  });
  it("clamps month end", () => {
    expect(
      isTaskExpectedOnDate(
        {
          startDate: "2026-01-31",
          recurrence: { type: "interval", every: 1, unit: "month" },
        },
        "2026-02-28",
      ),
    ).toBe(true);
  });
  it("honours a Sunday week start", () => {
    const week = getWeekRange("2026-08-12", 0);
    expect(week.start.getDay()).toBe(0);
    expect(week.end.getDay()).toBe(6);
  });

  it("formats both locales", () => {
    expect(
      formatRecurrenceDescription({ type: "times_per_week", target: 3 }, "es"),
    ).toContain("3");
    expect(formatRecurrenceDescription({ type: "daily" }, "en")).toBe(
      "Every day",
    );
  });
  it("handles cross-midnight night", () =>
    expect(classifyDayPart("02:30")).toBe("night"));
  it("rejects invalid target", () =>
    expect(
      recurrenceConfigSchema.safeParse({ type: "times_per_week", target: 8 })
        .success,
    ).toBe(false));
  it("supports anchored n-week intervals", () => {
    expect(
      isTaskExpectedOnDate(
        {
          startDate: "2026-07-06",
          recurrence: { type: "interval", every: 2, unit: "week" },
        },
        "2026-07-20",
      ),
    ).toBe(true);
    expect(
      isTaskExpectedOnDate(
        {
          startDate: "2026-07-06",
          recurrence: { type: "interval", every: 2, unit: "week" },
        },
        "2026-07-13",
      ),
    ).toBe(false);
  });
  it("caps weekly-frequency progress at its target", () => {
    const task = {
      startDate: "2026-07-01",
      recurrence: { type: "times_per_week" as const, target: 2 },
    };
    const result = calculateWeeklyProgress(
      [task],
      new Map([[task, ["2026-07-27", "2026-07-28", "2026-07-29"]]]),
      "2026-07-29",
    );
    expect(result).toEqual({ completed: 2, expected: 2, percentage: 100 });
  });
});
