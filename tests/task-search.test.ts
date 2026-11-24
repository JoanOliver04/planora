import { describe, expect, it } from "vitest";
import { normalizeTaskSearch } from "@/lib/workspace/task-search";
import { findSearchResults } from "@/features/workspace/search-index";

describe("task search normalization", () => {
  it("matches case, accents and surrounding whitespace", () => {
    const needle = normalizeTaskSearch("  ingles ");
    expect(normalizeTaskSearch("Estudiar inglés").includes(needle)).toBe(true);
    expect(
      normalizeTaskSearch("Gym").includes(normalizeTaskSearch("gym")),
    ).toBe(true);
  });
  it("ranks exact names across types before prefixes, title words and descriptions", () => {
    const records = [
      "Buying supplies",
      "Weekend revisión",
      "Revisión final",
      "Revisión",
    ].map((title) => ({
      kind: "event" as const,
      id: title,
      title,
      name: normalizeTaskSearch(title),
      text: normalizeTaskSearch(title + " revisión de marzo"),
      description: null,
      context: undefined,
    }));
    expect(
      findSearchResults(records, "  REVISION ").map((r) => r.title),
    ).toEqual([
      "Revisión",
      "Revisión final",
      "Weekend revisión",
      "Buying supplies",
    ]);
    expect(
      findSearchResults(records, "  marzo   buying ").map((r) => r.title),
    ).toEqual(["Buying supplies"]);
    expect(findSearchResults(records, "    ")).toEqual([]);
  });
});
