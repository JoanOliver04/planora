import { describe, expect, it } from "vitest";
import { normalizeTaskSearch } from "@/lib/workspace/task-search";

describe("task search normalization", () => {
  it("matches case, accents and surrounding whitespace", () => {
    const needle = normalizeTaskSearch("  ingles ");
    expect(normalizeTaskSearch("Estudiar inglés").includes(needle)).toBe(true);
    expect(normalizeTaskSearch("Gym").includes(normalizeTaskSearch("gym"))).toBe(true);
  });
});