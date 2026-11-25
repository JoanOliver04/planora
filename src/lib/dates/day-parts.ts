import type { Json } from "@/types/database";

export const defaultDayParts = {
  morning: { start: "05:00", end: "12:00" },
  afternoon: { start: "12:00", end: "18:00" },
  night: { start: "18:00", end: "05:00" },
};

export function normalizeDayParts(
  value: Json | undefined,
): typeof defaultDayParts {
  const settings =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const time = (value: unknown, fallback: string) =>
    typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
      ? value
      : fallback;
  function range(part: keyof typeof defaultDayParts) {
    const saved = settings[part];
    if (!saved || typeof saved !== "object" || Array.isArray(saved))
      return defaultDayParts[part];
    return {
      start: time(saved?.start, defaultDayParts[part].start),
      end: time(saved?.end, defaultDayParts[part].end),
    };
  }
  return {
    morning: range("morning"),
    afternoon: range("afternoon"),
    night: range("night"),
  };
}

export function classifyDayPart(time: string, parts = defaultDayParts) {
  for (const part of ["morning", "afternoon"] as const) {
    const { start, end } = parts[part];
    const inRange =
      start > end ? time >= start || time < end : time >= start && time < end;
    if (inRange) return part;
  }
  return "night";
}
