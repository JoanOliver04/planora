import { describe, expect, it } from "vitest";
import {
  formatNaturalDate,
  greetingKey,
  uniqueMetadata,
} from "@/features/workspace/presentation";

describe("workspace presentation", () => {
  it("formats natural dates in Spanish and English", () => {
    expect(formatNaturalDate("2026-07-26", "es", "Europe/Madrid")).toBe(
      "domingo, 26 de julio",
    );
    expect(formatNaturalDate("2026-07-26", "en", "Europe/London")).toBe(
      "Sunday, 26 July",
    );
  });

  it("does not repeat timing metadata", () => {
    expect(
      uniqueMetadata([
        "En cualquier momento",
        "En cualquier momento",
        "Cada día",
      ]),
    ).toEqual(["En cualquier momento", "Cada día"]);
  });

  it("selects a contextual greeting in the user timezone", () => {
    expect(greetingKey("UTC", new Date("2026-07-26T08:00:00Z"))).toBe(
      "goodMorning",
    );
    expect(greetingKey("UTC", new Date("2026-07-26T20:00:00Z"))).toBe(
      "goodEvening",
    );
  });
});
