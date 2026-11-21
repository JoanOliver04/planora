import { addDays, addWeeks, format, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

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
    trigger = recurringClockTrigger(
      format(addDays(parseISO(day), 1), "yyyy-MM-dd"),
      time,
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
  recurrence: ReminderRecurrence,
  timezone = "UTC",
  preferredTime?: string | null,
) {
  if (recurrence === "once") return null;
  const localDate = formatInTimeZone(trigger, timezone, "yyyy-MM-dd");
  const localTime = formatInTimeZone(trigger, timezone, "HH:mm:ss");
  const nextDate =
    recurrence === "daily"
      ? addDays(parseISO(localDate), 1)
      : addWeeks(parseISO(localDate), 1);
  const nextDay = format(nextDate, "yyyy-MM-dd");
  return preferredTime
    ? recurringClockTrigger(nextDay, preferredTime, timezone)
    : fromZonedTime(nextDay + "T" + localTime, timezone);
}

/** Walks past missed occurrences so a stale reminder is not delivered once per skipped day. */
export function nextFutureTrigger(
  trigger: Date,
  recurrence: ReminderRecurrence,
  timezone = "UTC",
  now = new Date(),
  preferredTime?: string | null,
) {
  if (recurrence === "once") return null;
  let next = advanceTrigger(trigger, recurrence, timezone, preferredTime);
  for (let step = 0; step < 3660 && next && next <= now; step += 1) {
    const following = advanceTrigger(next, recurrence, timezone, preferredTime);
    if (!following || following.getTime() === next.getTime()) return null;
    next = following;
  }
  return next && next > now ? next : null;
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
  const trigger = customTrigger(date, time, timezone);
  const displayed = formatInTimeZone(trigger, timezone, "yyyy-MM-dd'T'HH:mm");
  const requested = `${date}T${time}`;
  // If the clock jumps over this time, move this occurrence forward by the gap.
  // The following occurrence still uses the preferred wall-clock time.
  const difference =
    Date.parse(requested + ":00Z") - Date.parse(displayed + ":00Z");
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
  if (recurrence === "once") return null;

  const dayInZone = (instant: Date) =>
    new Date(formatInTimeZone(instant, timezone, "yyyy-MM-dd") + "T00:00:00Z");
  const startDay = dayInZone(trigger);
  const daysElapsed =
    (dayInZone(now).getTime() - startDay.getTime()) / 86_400_000;
  const period = recurrence === "daily" ? 1 : 7;
  // Jump to the current period, retaining the local wall-clock time.
  startDay.setUTCDate(
    startDay.getUTCDate() + Math.floor(daysElapsed / period) * period,
  );
  const time = formatInTimeZone(trigger, timezone, "HH:mm");
  const candidate = recurringClockTrigger(
    startDay.toISOString().slice(0, 10),
    time,
    timezone,
  );
  if (candidate > now) return candidate;
  startDay.setUTCDate(startDay.getUTCDate() + period);
  return recurringClockTrigger(
    startDay.toISOString().slice(0, 10),
    time,
    timezone,
  );
}
