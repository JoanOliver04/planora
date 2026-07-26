import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { addDays, endOfWeek, startOfWeek } from "date-fns";
export const localDate = (timezone: string, instant: Date = new Date()) =>
  formatInTimeZone(instant, timezone, "yyyy-MM-dd");
export const zonedDate = (day: string, timezone: string) =>
  fromZonedTime(`${day}T12:00:00`, timezone);
export function localWeek(
  timezone: string,
  instant: Date = new Date(),
  weekStartsOn: 0 | 1 = 1,
) {
  const day = zonedDate(localDate(timezone, instant), timezone),
    start = startOfWeek(day, { weekStartsOn }),
    end = endOfWeek(day, { weekStartsOn });
  return {
    start: formatInTimeZone(start, timezone, "yyyy-MM-dd"),
    end: formatInTimeZone(end, timezone, "yyyy-MM-dd"),
    days: Array.from({ length: 7 }, (_, i) =>
      formatInTimeZone(addDays(start, i), timezone, "yyyy-MM-dd"),
    ),
  };
}
