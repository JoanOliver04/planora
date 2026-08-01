import { addDays, addWeeks, format, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export function nextDailyTrigger(
  time: string,
  timezone: string,
  now = new Date(),
) {
  const day = formatInTimeZone(now, timezone, "yyyy-MM-dd");
  let trigger = fromZonedTime(day + "T" + time + ":00", timezone);
  if (trigger <= now)
    trigger = fromZonedTime(
      format(addDays(parseISO(day), 1), "yyyy-MM-dd") + "T" + time + ":00",
      timezone,
    );
  return trigger;
}
export function relativeTrigger(
  date: string,
  time: string | null,
  timezone: string,
  minutesBefore: number,
) {
  const target = fromZonedTime(
    date + "T" + (time?.slice(0, 5) ?? "09:00") + ":00",
    timezone,
  );
  return new Date(target.getTime() - minutesBefore * 60_000);
}
export function advanceTrigger(
  trigger: Date,
  recurrence: "once" | "daily" | "weekly",
  timezone = "UTC",
) {
  if (recurrence === "once") return null;
  const localDate = formatInTimeZone(trigger, timezone, "yyyy-MM-dd");
  const localTime = formatInTimeZone(trigger, timezone, "HH:mm:ss");
  const nextDate =
    recurrence === "daily"
      ? addDays(parseISO(localDate), 1)
      : addWeeks(parseISO(localDate), 1);
  return fromZonedTime(
    format(nextDate, "yyyy-MM-dd") + "T" + localTime,
    timezone,
  );
}
