import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getMonthEventRange,
  mergeRowsById,
  readWorkspaceRows,
} from "@/features/workspace/workspace-data";

describe("workspace historical loading", () => {
  it("discards an incomplete result if a later page fails", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, id) => ({ id }));
    const pages: number[][] = [];
    const result = await readWorkspaceRows({
      range: async (from, to) => {
        pages.push([from, to]);
        return from === 0
          ? { data: firstPage, error: null }
          : { data: null, error: { message: "Offline" } };
      },
    });
    expect(pages).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(result).toEqual({ data: null, error: { message: "Offline" } });
  });
  it("merges a fetched historical day without duplicating existing rows", () => {
    expect(
      mergeRowsById(
        [
          { id: "same", value: "old" },
          { id: "current", value: "today" },
        ],
        [
          { id: "same", value: "fresh" },
          { id: "historical", value: "past" },
        ],
      ),
    ).toEqual([
      { id: "same", value: "fresh" },
      { id: "current", value: "today" },
      { id: "historical", value: "past" },
    ]);
  });

  it("loads selected dates on demand and bounds the initial completion window", () => {
    const source = readFileSync(
      "src/features/workspace/use-workspace.ts",
      "utf8",
    );
    expect(source).toContain('.gte("occurrence_date", week.start)');
    expect(source).toContain('.lte("occurrence_date", week.end)');
    expect(source).toContain('.eq("event_date", day)');
    expect(source).toContain('needed.has("completions") && mode !== "tasks"');
    expect(source).toContain('mode === "today" || mode === "tasks"');
    expect(source).toContain('task.recurrence_type === "once"');
    expect(source).toContain("decideBootstrapPhase");
    expect(source).toContain("withTimeout");
    expect(source).toContain('window.addEventListener("online"');
    expect(source).toContain("presentedRef");
    expect(source).toContain("loadCachedWorkspace(sessionUserId, mode)");
  });

  it("bounds month events to the visible six-week grid", () => {
    expect(getMonthEventRange("2026-08-20", 1)).toEqual({
      start: "2026-07-27",
      end: "2026-09-06",
    });
    expect(getMonthEventRange("2026-08-20", 0)).toEqual({
      start: "2026-07-26",
      end: "2026-09-05",
    });
  });
});
