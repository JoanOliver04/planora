export const demoViews = [
  "today",
  "week",
  "month",
  "search",
  "tasks",
  "focus",
  "events",
  "history",
  "statistics",
  "reminders",
  "schedules",
  "categories",
  "templates",
  "settings",
  "data",
  "more",
] as const;

export type DemoView = (typeof demoViews)[number];

export function isDemoView(value: string): value is DemoView {
  return (demoViews as readonly string[]).includes(value);
}

export function getMonthGridCellCount(
  leadingDays: number,
  daysInMonth: number,
) {
  return Math.ceil((leadingDays + daysInMonth) / 7) * 7;
}
