import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
export const localDate = (timezone: string, instant: Date = new Date()) =>
  formatInTimeZone(instant, timezone, "yyyy-MM-dd");
export const zonedDate = (day: string, timezone: string) =>
  fromZonedTime(`${day}T12:00:00`, timezone);
export function localWeek(
  timezone: string,
  instant: Date = new Date(),
  weekStartsOn: 0 | 1 = 1,
) {
  const calendarDay = localDate(timezone, instant),
    day = new Date(calendarDay + "T00:00:00Z"),
    offset = (day.getUTCDay() - weekStartsOn + 7) % 7,
    start = new Date(day);
  start.setUTCDate(start.getUTCDate() - offset);
  const format = (value: Date) => value.toISOString().slice(0, 10);
  return {
    start: format(start),
    end: format(new Date(start.getTime() + 6 * 86_400_000)),
    days: Array.from({ length: 7 }, (_, i) => format(new Date(start.getTime() + i * 86_400_000))),
  };
}
