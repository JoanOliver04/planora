export function uniqueMetadata(
  parts: Array<string | null | undefined | false>,
): string[] {
  return [...new Set(parts.filter((part): part is string => Boolean(part)))];
}

export function formatCategoryMetadata(name: string, emoji?: string | null) {
  return `${emoji ?? ""} ${name}`.trim();
}

export function formatTaskTime(
  startTime: string | null,
  endTime?: string | null,
) {
  if (!startTime) return null;
  const start = startTime.slice(0, 5);
  const end = endTime?.slice(0, 5);
  return end ? `${start}–${end}` : start;
}

export function formatNaturalDate(
  day: string,
  locale: "es" | "en",
  _timezone: string,
  options: { year?: boolean; weekday?: boolean } = {},
) {
  const instant = new Date(`${day}T12:00:00`);
  const formatted = new Intl.DateTimeFormat(
    locale === "es" ? "es-ES" : "en-GB",
    {
      weekday: options.weekday === false ? undefined : "long",
      day: "numeric",
      month: "long",
      year: options.year ? "numeric" : undefined,
      timeZone: "UTC",
    },
  ).format(instant);
  return locale === "en" ? formatted.replace(/^([^ ]+) /, "$1, ") : formatted;
}

export function greetingKey(timezone: string, instant = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone: timezone,
    }).format(instant),
  );
  if (hour < 12) return "goodMorning" as const;
  if (hour < 19) return "goodAfternoon" as const;
  return "goodEvening" as const;
}
