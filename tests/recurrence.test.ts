import { describe, expect, it } from "vitest";
import {
  classifyDayPart,
  formatRecurrenceDescription,
  getExpectedTaskOccurrences,
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
});
