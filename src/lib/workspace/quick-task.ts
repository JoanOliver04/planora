import type { RecurrenceConfig } from "@/lib/validation/task";

export type QuickTaskValues = {
  title: string;
  startDate: string;
  recurrence: RecurrenceConfig;
  timing: { mode: "anytime" } | { mode: "specific_time"; startTime: string };
};
export type QuickTaskIssue =
  "emptyTitle" | "tooLong" | "invalidDate" | "invalidTime";
export type ParsedQuickTask = {
  values: QuickTaskValues;
  detected: boolean;
  issue?: QuickTaskIssue;
};

const dayNumbers: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};
const day =
  "(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?)";
const separator = "(?:\\s*,\\s*(?:(?:y|and)\\s+)?|\\s+(?:y|and|&)\\s+)";
const daysSuffix = new RegExp(
  `(?:^|\\s)(?:(cada|los|every|on|el)\\s+)?(${day}(?:${separator}${day})*)$`,
  "iu",
);
const dayToken = new RegExp(day, "giu");
const timeSuffix =
  /(?:^|\s)(?:a\s+las?|at)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/iu;

function validDate(value: string) {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(instant.getTime()) &&
    instant.toISOString().slice(0, 10) === value
  );
}
function addDays(value: string, amount: number) {
  const instant = new Date(`${value}T12:00:00Z`);
  instant.setUTCDate(instant.getUTCDate() + amount);
  return instant.toISOString().slice(0, 10);
}
function weekday(value: string) {
  return new Date(`${value}T12:00:00Z`).getUTCDay();
}

/** A deliberately bounded grammar. Only recognized suffixes are removed;
 * unsupported text remains in the title and literal mode bypasses detection. */
export function parseQuickTask(
  raw: string,
  today: string,
  detect = true,
): ParsedQuickTask {
  if (!validDate(today))
    throw new Error("A valid local calendar date is required");
  const values: QuickTaskValues = {
    title: raw.normalize("NFC").trim(),
    startDate: today,
    recurrence: { type: "once" },
    timing: { mode: "anytime" },
  };
  const result: ParsedQuickTask = { values, detected: false };
  if (raw.length > 280) return { ...result, issue: "tooLong" };
  let text = values.title;
  function stripTime() {
    const match = timeSuffix.exec(text);
    if (!match) return;
    const hour = Number(match[1]),
      minute = Number(match[2] ?? "0");
    const meridiem = match[3]?.replaceAll(".", "").toLowerCase();
    if (
      values.timing.mode !== "anytime" ||
      minute > 59 ||
      (meridiem ? hour < 1 || hour > 12 : hour > 23)
    ) {
      result.issue = "invalidTime";
      return;
    }
    const clockHour = meridiem
      ? (hour % 12) + (meridiem === "pm" ? 12 : 0)
      : hour;
    values.timing = {
      mode: "specific_time",
      startTime: `${String(clockHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    };
    text = text.slice(0, match.index).trim();
    result.detected = true;
  }
  if (detect) {
    stripTime();
    const daily =
      /(?:^|\s)(?:cada d[ií]a|todos los d[ií]as|a diario|diariamente|every day|daily)$/iu.exec(
        text,
      );
    const weekdays =
      /(?:^|\s)(?:entre semana|de lunes a viernes|on weekdays|every weekday|weekdays)$/iu.exec(
        text,
      );
    const relative =
      /(?:^|\s)(pasado ma[ñn]ana|day after tomorrow|ma[ñn]ana|tomorrow|hoy|today)$/iu.exec(
        text,
      );
    const absolute = /(?:^|\s)(?:(?:el|on)\s+)?(\d{4}-\d{2}-\d{2})$/iu.exec(
      text,
    );
    const days = daysSuffix.exec(text);
    const match = daily ?? weekdays ?? relative ?? absolute ?? days;
    if (match) {
      if (daily) values.recurrence = { type: "daily" };
      else if (weekdays) {
        values.recurrence = { type: "weekdays", weekdays: [1, 2, 3, 4, 5] };
        values.startDate = addDays(
          today,
          Math.min(
            ...[1, 2, 3, 4, 5].map(
              (number) => (number - weekday(today) + 7) % 7,
            ),
          ),
        );
      } else if (relative) {
        const word = relative[1].toLowerCase();
        values.startDate = addDays(
          today,
          /^(pasado|day after)/.test(word)
            ? 2
            : /^(hoy|today)$/.test(word)
              ? 0
              : 1,
        );
      } else if (absolute) {
        if (validDate(absolute[1])) values.startDate = absolute[1];
        else result.issue = "invalidDate";
      } else if (days) {
        const selected = [...days[2].matchAll(dayToken)].map(([token]) => {
          const key = token
            .normalize("NFD")
            .replace(/\p{M}/gu, "")
            .toLowerCase();
          return dayNumbers[key] ?? dayNumbers[key.replace(/s$/, "")];
        });
        const unique = [...new Set(selected)].sort((a, b) => a - b);
        const repeating =
          unique.length > 1 ||
          /^(cada|los|every)$/i.test(days[1] ?? "") ||
          /days$/i.test(days[2]);
        values.startDate = addDays(
          today,
          Math.min(
            ...unique.map((number) => (number - weekday(today) + 7) % 7),
          ),
        );
        if (repeating)
          values.recurrence = { type: "weekdays", weekdays: unique };
      }
      text = text.slice(0, match.index).trim();
      result.detected = true;
    }
    stripTime();
  }
  values.title = text;
  if (!result.issue) {
    if (!text) result.issue = "emptyTitle";
    else if (text.length > 140) result.issue = "tooLong";
  }
  return result;
}
