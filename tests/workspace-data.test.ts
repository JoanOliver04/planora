import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mergeRowsById } from "@/features/workspace/workspace-data";

describe("workspace historical loading", () => {
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
    expect(source).toContain('.eq("occurrence_date", day)');
    expect(source).toContain('.eq("event_date", day)');
    expect(source).toContain('else if (mode !== "tasks")');
    expect(source).toContain('task.recurrence_type === "once"');
  });
});
