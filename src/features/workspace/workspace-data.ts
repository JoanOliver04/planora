import { addDays } from "date-fns";

export function mergeRowsById<T extends { id: string }>(
  base: T[],
  incoming: T[],
) {
  const result = new Map(base.map((item) => [item.id, item]));
  incoming.forEach((item) => result.set(item.id, item));
  return [...result.values()];
}

export function getMonthEventRange(today: string, weekStartsOn: 0 | 1) {
  const todayDate = new Date(`${today}T12:00:00Z`);
  const monthStart = new Date(
    Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth(), 1, 12),
  );
  const offset = (monthStart.getUTCDay() - weekStartsOn + 7) % 7;
  const start = addDays(monthStart, -offset);
  const end = addDays(start, 41);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}
