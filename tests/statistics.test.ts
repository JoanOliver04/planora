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

  it("builds a labelled 90-day heatmap including empty days", () => {
    const result = calculateStatistics(
      fixture(),
      new Date("2026-08-01T12:00:00Z"),
    );
    expect(result.heatmap).toHaveLength(90);
    expect(result.heatmap[0]?.date).toBe("2026-05-04");
    expect(result.heatmap.at(-1)).toMatchObject({
      date: "2026-08-01",
      count: 1,
      level: 1,
    });
    expect(result.heatmap.some((day) => day.count === 0)).toBe(true);
  });

  it("compares the current week and month with the same number of elapsed days", () => {
    const data = fixture();
    data.completions.push(
      ...["2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30"].map(
        (date) => ({
          id: `extra-${date}`,
          user_id: "user",
          task_id: "task",
          occurrence_date: date,
          completed_at: `${date}T10:00:00Z`,
          task_snapshot: { category_name: "Estudio" },
        }),
      ),
    );
    const result = calculateStatistics(data, new Date("2026-08-06T12:00:00Z"));
    // Thursday 6 Aug. Current week is Mon 3–Thu 6 (the fixture's 1 Aug is
    // the previous Saturday). Previous comparison is Mon 27–Thu 30 Jul.
    expect(result.week.current).toBe(0);
    expect(result.week.previous).toBe(4);
    expect(result.month.current).toBe(1);
    expect(result.month.previous).toBe(0);
  });

  it("rates categories across 90 days and follows a renamed category id", () => {
    const data = fixture();
    data.categories = [
      { id: "category", name: "Estudio", colour: "#4F6B45" },
      { id: "other", name: "Estudio", colour: "#111111" },
    ] as unknown as WorkspaceData["categories"];
    data.completions = [
      ...Array.from({ length: 15 }, (_, index) => ({
        id: `day-${index}`,
        user_id: "user",
        task_id: "task",
        occurrence_date: `2026-07-${String(index + 1).padStart(2, "0")}`,
        completed_at: `2026-07-${String(index + 1).padStart(2, "0")}T10:00:00Z`,
        task_snapshot: {
          category_id: "category",
          category_name: "Nombre antiguo",
        },
      })),
      {
        id: "ambiguous",
        user_id: "user",
        task_id: "task-2",
        occurrence_date: "2026-07-20",
        completed_at: "2026-07-20T10:00:00Z",
        task_snapshot: { category_name: "Estudio" },
      },
    ] as unknown as WorkspaceData["completions"];
    const result = calculateStatistics(data, new Date("2026-08-01T12:00:00Z"));
    const current = result.categories.find((item) => item.id === "category");
    expect(current?.completed).toBe(15);
    expect(current?.name).toBe("Estudio");
    expect(current?.rate).toBe(17);
    expect(result.categories.some((item) => item.id === "other")).toBe(false);
    expect(
      result.categories.find((item) => item.id === "name:Estudio")?.completed,
    ).toBe(1);
  });

  it("ignores completions outside the 90-day window", () => {
    const data = fixture();
    data.completions.push({
      id: "old",
      user_id: "user",
      task_id: "task",
      occurrence_date: "2026-01-01",
      completed_at: "2026-01-01T10:00:00Z",
      task_snapshot: { category_name: "Estudio" },
    } as unknown as WorkspaceData["completions"][number]);
    const result = calculateStatistics(data, new Date("2026-08-01T12:00:00Z"));
    expect(result.week.current).toBe(3);
    expect(result.streak).toBe(3);
    expect(result.categories[0]?.completed).toBe(3);
    expect(result.heatmap.some((day) => day.date === "2026-01-01")).toBe(false);
  });

  it("clamps the previous month comparison to that month's last day", () => {
    const data = fixture();
    data.completions = ["2026-02-01", "2026-02-28", "2026-03-31"].map(
      (date) => ({
        id: date,
        user_id: "user",
        task_id: "task",
        occurrence_date: date,
        completed_at: `${date}T10:00:00Z`,
        task_snapshot: { category_name: "Estudio" },
      }),
    ) as unknown as WorkspaceData["completions"];
    const result = calculateStatistics(data, new Date("2026-03-31T12:00:00Z"));
    expect(result.month.current).toBe(1);
    expect(result.month.previous).toBe(2);
  });
});
