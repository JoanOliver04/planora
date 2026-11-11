import { localDate, localWeek } from "@/lib/dates/timezone";

/** Four local calendar weeks, padded for UTC query boundaries and DST. */
export function goalSessionWindow(
  timezone: string,
  now: Date,
  weekStartsOn: 0 | 1,
) {
  const week = localWeek(timezone, now, weekStartsOn);
  const start = new Date(`${week.start}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 22);
  const end = new Date(`${week.end}T23:59:59.999Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return {
    ...week,
    queryStart: start.toISOString(),
    queryEnd: end.toISOString(),
  };
}

export function sessionsInCurrentWeek<T extends { startedAt: string }>(
  sessions: T[],
  timezone: string,
  week: { start: string; end: string },
) {
  return sessions.filter((session) => {
    const day = localDate(timezone, new Date(session.startedAt));
    return day >= week.start && day <= week.end;
  });
}
