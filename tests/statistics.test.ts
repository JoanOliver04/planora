import { describe, expect, it } from "vitest";
import { calculateStatistics } from "@/features/statistics/analytics";
import type { WorkspaceData } from "@/features/workspace/types";

function fixture(): WorkspaceData {
  const completion = (date: string, hour: string, category = "Estudio") => ({
    id: date + hour,
    user_id: "user",
    task_id: "task",
    occurrence_date: date,
    completed_at: date + "T" + hour + ":00:00Z",
    task_snapshot: { category_name: category },
  });
  return {
    user: { id: "user" },
    profile: {
      id: "user",
      timezone: "UTC",
      week_starts_on: 1,
      preferences: {},
    },
    schedules: [],
    categories: [{ id: "category", name: "Estudio", colour: "#4F6B45" }],
    tasks: [
      {
        id: "task",
        category_id: "category",
        is_active: true,
        archived_at: null,
      },
    ],
    events: [],
    completions: [
      completion("2026-07-30", "09"),
      completion("2026-07-31", "10"),
      completion("2026-08-01", "20"),
    ],
  } as unknown as WorkspaceData;
}

describe("statistics analytics", () => {
  it("calculates periods, streaks, categories and productive times", () => {
    const result = calculateStatistics(
      fixture(),
      new Date("2026-08-01T12:00:00Z"),
    );
    expect(result.week.current).toBe(3);
    expect(result.month.current).toBe(1);
    expect(result.streak).toBe(3);
    expect(result.bestStreak).toBe(3);
    expect(result.categories[0].completed).toBe(3);
    expect(result.dayParts.find((part) => part.key === "morning")?.count).toBe(
      2,
    );
    expect(result.dayParts.find((part) => part.key === "night")?.count).toBe(1);
  });

  it("deduplicates malformed duplicate task occurrences", () => {
    const data = fixture();
    data.completions.push({ ...data.completions[0], id: "duplicate" });
    const result = calculateStatistics(data, new Date("2026-08-01T12:00:00Z"));
    expect(result.week.current).toBe(3);
    expect(result.categories[0].completed).toBe(3);
  });

  it("builds a labelled 91-day heatmap including empty days", () => {
    const result = calculateStatistics(
      fixture(),
      new Date("2026-08-01T12:00:00Z"),
    );
    expect(result.heatmap).toHaveLength(91);
    expect(result.heatmap.at(-1)).toMatchObject({
      date: "2026-08-01",
      count: 1,
      level: 1,
    });
    expect(result.heatmap.some((day) => day.count === 0)).toBe(true);
  });
});
