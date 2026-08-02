import { describe, expect, it } from "vitest";
import { categoriesForSchedule } from "@/features/workspace/categories";
import type { Category } from "@/features/workspace/types";

const category = (id: string, schedule_id?: string | null) =>
  ({ id, schedule_id }) as Category;

describe("category schedule scope", () => {
  it("shows global and matching categories only", () => {
    const categories = [
      category("global", null),
      category("legacy"),
      category("a", "schedule-a"),
      category("b", "schedule-b"),
    ];

    expect(
      categoriesForSchedule(categories, "schedule-a").map((item) => item.id),
    ).toEqual(["global", "legacy", "a"]);
  });
});
