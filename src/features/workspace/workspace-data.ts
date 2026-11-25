import { shiftCalendarDay } from "@/lib/dates/calendar-day";
import { fetchAllRows } from "@/lib/backup/fetch-all";

export async function readWorkspaceRows<Row>(query: {
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;
}) {
  try {
    const data = await fetchAllRows((from, to) => query.range(from, to));
    return { data, error: null };
  } catch (cause) {
    return {
      data: null,
      error: { message: cause instanceof Error ? cause.message : "query" },
    };
  }
}

export function mergeRowsById<T extends { id: string }>(
  base: T[],
  incoming: T[],
) {
  const result = new Map(base.map((item) => [item.id, item]));
  incoming.forEach((item) => result.set(item.id, item));
  return [...result.values()];
}

export function getMonthEventRange(today: string, weekStartsOn: 0 | 1) {
  const first = `${today.slice(0, 7)}-01`;
  const monthStart = new Date(`${first}T12:00:00Z`);
  const offset = (monthStart.getUTCDay() - weekStartsOn + 7) % 7;
  const start = shiftCalendarDay(first, -offset);
  return { start, end: shiftCalendarDay(start, 41) };
}

export function getHistoryRange(today: string, month?: string | null) {
  if (!month) return { start: shiftCalendarDay(today, -89), end: today };
  const start = month + "-01";
  const last = new Date(start + "T12:00:00Z");
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  return {
    start,
    end: month === today.slice(0, 7) ? today : last.toISOString().slice(0, 10),
  };
}
