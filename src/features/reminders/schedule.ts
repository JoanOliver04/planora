import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { shiftCalendarDay } from "@/lib/dates/calendar-day";

export type ReminderRecurrence = "once" | "daily" | "weekly";
export const MAX_REMINDER_OFFSET = 7 * 1440;

export function effectiveReminderTrigger(
  scheduledAt: string,
  snoozedUntil: string | null,
) {
  return snoozedUntil && Date.parse(snoozedUntil) > Date.parse(scheduledAt)
    ? snoozedUntil
    : scheduledAt;
}

export function nextDailyTrigger(
  time: string,
  timezone: string,
  now = new Date(),
) {
  const day = formatInTimeZone(now, timezone, "yyyy-MM-dd");
  let trigger = recurringClockTrigger(day, time, timezone);
  if (trigger <= now)
    trigger = recurringClockTrigger(shiftCalendarDay(day, 1), time, timezone);
  return trigger;
}
export function relativeTrigger(
  date: string,
  time: string | null,
  timezone: string,
  minutesBefore: number,
) {
  const target = recurringClockTrigger(
    date,
    time?.slice(0, 5) ?? "09:00",
    timezone,
  );
  return new Date(target.getTime() - minutesBefore * 60_000);
}
export function advanceTrigger(
  trigger: Date,
  recurrence: ReminderRecurrence,
  timezone = "UTC",
  preferredTime?: string | null,
) {
  return nextFutureTrigger(
    trigger,
    recurrence,
    timezone,
    trigger,
    preferredTime,
  );
}

/** Advance at least one occurrence, calculating missed periods in local calendar days. */
export function nextFutureTrigger(
  trigger: Date,
  recurrence: ReminderRecurrence,
  timezone = "UTC",
  now = new Date(),
  preferredTime?: string | null,
) {
  if (
    recurrence === "once" ||
    !Number.isFinite(trigger.getTime()) ||
    !Number.isFinite(now.getTime())
  )
    return null;
  const start = formatInTimeZone(trigger, timezone, "yyyy-MM-dd");
  const today = formatInTimeZone(now, timezone, "yyyy-MM-dd");
  const elapsed = (Date.parse(today) - Date.parse(start)) / 86_400_000;
  const period = recurrence === "weekly" ? 7 : 1;
  const periods = Math.max(1, Math.floor(elapsed / period));
  const day = shiftCalendarDay(start, periods * period);
  const time = preferredTime || formatInTimeZone(trigger, timezone, "HH:mm:ss");
  const candidate = recurringClockTrigger(day, time, timezone);
  return candidate > now
    ? candidate
    : recurringClockTrigger(shiftCalendarDay(day, period), time, timezone);
}

export function customTrigger(date: string, time: string, timezone: string) {
  return fromZonedTime(date + "T" + time + ":00", timezone);
}

export function exactTrigger(date: string, time: string, timezone: string) {
  const trigger = customTrigger(date, time, timezone);
  // A clock change can make a local time nonexistent.
  return Number.isFinite(trigger.getTime()) &&
    formatInTimeZone(trigger, timezone, "yyyy-MM-dd'T'HH:mm") ===
      `${date}T${time}`
    ? trigger
    : null;
}

function recurringClockTrigger(date: string, time: string, timezone: string) {
  const requested = date + "T" + (time.length === 5 ? time + ":00" : time);
  const trigger = fromZonedTime(requested, timezone);
  const displayed = formatInTimeZone(
    trigger,
    timezone,
    "yyyy-MM-dd'T'HH:mm:ss",
  );
  // If the clock jumps over this time, move this occurrence forward by the gap.
  // The following occurrence still uses the preferred wall-clock time.
  const difference = Date.parse(requested + "Z") - Date.parse(displayed + "Z");
  return difference > 0 ? new Date(trigger.getTime() + difference) : trigger;
}

export function nextLinkedTrigger(
  trigger: Date,
  recurrence: ReminderRecurrence,
  timezone: string,
  now = new Date(),
) {
  if (!Number.isFinite(trigger.getTime())) return null;
  if (trigger > now) return trigger;
  return nextFutureTrigger(trigger, recurrence, timezone, now);
}
