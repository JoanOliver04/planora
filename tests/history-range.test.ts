import { describe, expect, it } from "vitest";
import { getHistoryRange } from "@/features/workspace/workspace-data";
import {
  classifyDayPart,
  defaultDayParts,
  normalizeDayParts,
} from "@/lib/dates/day-parts";

describe("activity date boundaries", () => {
  it("includes today and the preceding 89 days and respects leap months", () => {
    expect(getHistoryRange("2024-03-01")).toEqual({
      start: "2023-12-03",
      end: "2024-03-01",
    });
    expect(getHistoryRange("2026-11-25", "2024-02")).toEqual({
      start: "2024-02-01",
      end: "2024-02-29",
    });
    expect(getHistoryRange("2026-11-25", "2026-11")).toEqual({
      start: "2026-11-01",
      end: "2026-11-25",
    });
  });
  it("repairs missing or malformed clock fields from older backups in memory", () => {
    expect(normalizeDayParts({})).toEqual(defaultDayParts);
    const parts = normalizeDayParts({
      morning: { start: "07:55", end: "29:59" },
      afternoon: [],
      night: null,
    });
    expect(parts.morning).toEqual({ start: "07:55", end: "12:00" });
    expect(classifyDayPart("07:54", parts)).toBe("night");
    expect(classifyDayPart("07:55", parts)).toBe("morning");
  });
});
