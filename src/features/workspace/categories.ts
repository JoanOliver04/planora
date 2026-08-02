import type { Category } from "./types";

export function categoriesForSchedule(
  categories: Category[],
  scheduleId: string | null | undefined,
) {
  return categories.filter(
    (category) => !category.schedule_id || category.schedule_id === scheduleId,
  );
}
