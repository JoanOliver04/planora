import { addDays, format } from "date-fns";

export const DEMO_TTL = 24 * 60 * 60 * 1000;
export const DEMO_STORAGE_KEY = "planora-demo-v1";
const MAX_DEMO_STORAGE_BYTES = 250_000;
const MAX_DEMO_ITEMS = 2_000;

export type DemoTask = {
  id: string;
  title: string;
  emoji: string;
  categoryId: string;
  scheduleId: string;
  dayPart: "morning" | "afternoon" | "night" | "anytime";
  archived: boolean;
};
export type DemoEvent = {
  id: string;
  title: string;
  emoji: string;
  date: string;
  time?: string;
};
export type DemoState = {
  version: 1;
  locale?: "es" | "en";
  expiresAt: number;
  activeScheduleId: string;
  schedules: Array<{ id: string; name: string; emoji: string }>;
  categories: Array<{ id: string; name: string; emoji: string; color: string }>;
  tasks: DemoTask[];
  events: DemoEvent[];
  completions: Array<{ taskId: string; date: string; completedAt: string }>;
};

const day = (date: Date, offset: number) =>
  format(addDays(date, offset), "yyyy-MM-dd");

const copy = {
  es: {
    scheduleNormal: "Normal",
    scheduleFocus: "Semana de enfoque",
    health: "Bienestar",
    study: "Estudios",
    work: "Trabajo",
    personal: "Personal",
    water: "Beber agua al despertar",
    plan: "Revisar prioridades del día",
    focus: "Sesión de trabajo profundo",
    read: "Leer 20 minutos",
    walk: "Paseo sin móvil",
    review: "Revisión semanal",
    presentation: "Presentación del proyecto",
    dentist: "Dentista",
  },
  en: {
    scheduleNormal: "Regular",
    scheduleFocus: "Focus week",
    health: "Wellbeing",
    study: "Studies",
    work: "Work",
    personal: "Personal",
    water: "Drink water after waking up",
    plan: "Review today's priorities",
    focus: "Deep work session",
    read: "Read for 20 minutes",
    walk: "Walk without a phone",
    review: "Weekly review",
    presentation: "Project presentation",
    dentist: "Dentist",
  },
} as const;

export function createDemoState(
  now = new Date(),
  locale: "es" | "en" = "es",
): DemoState {
  const today = day(now, 0);
  const text = copy[locale];
  return {
    version: 1,
    locale,
    expiresAt: now.getTime() + DEMO_TTL,
    activeScheduleId: "schedule-normal",
    schedules: [
      { id: "schedule-normal", name: text.scheduleNormal, emoji: "🌿" },
      { id: "schedule-focus", name: text.scheduleFocus, emoji: "🎯" },
    ],
    categories: [
      { id: "health", name: text.health, emoji: "🌱", color: "#4f6b45" },
      { id: "study", name: text.study, emoji: "📚", color: "#2563eb" },
      { id: "work", name: text.work, emoji: "💼", color: "#7c3aed" },
      { id: "personal", name: text.personal, emoji: "✨", color: "#c2410c" },
    ],
    tasks: [
      {
        id: "water",
        title: text.water,
        emoji: "💧",
        categoryId: "health",
        scheduleId: "schedule-normal",
        dayPart: "morning",
        archived: false,
      },
      {
        id: "plan",
        title: text.plan,
        emoji: "🧭",
        categoryId: "work",
        scheduleId: "schedule-normal",
        dayPart: "morning",
        archived: false,
      },
      {
        id: "focus",
        title: text.focus,
        emoji: "🎯",
        categoryId: "work",
        scheduleId: "schedule-normal",
        dayPart: "afternoon",
        archived: false,
      },
      {
        id: "read",
        title: text.read,
        emoji: "📖",
        categoryId: "study",
        scheduleId: "schedule-normal",
        dayPart: "night",
        archived: false,
      },
      {
        id: "walk",
        title: text.walk,
        emoji: "🚶",
        categoryId: "health",
        scheduleId: "schedule-focus",
        dayPart: "afternoon",
        archived: false,
      },
    ],
    events: [
      {
        id: "review",
        title: text.review,
        emoji: "📊",
        date: today,
        time: "17:30",
      },
      {
        id: "presentation",
        title: text.presentation,
        emoji: "🚀",
        date: day(now, 2),
        time: "10:00",
      },
      {
        id: "dentist",
        title: text.dentist,
        emoji: "🦷",
        date: day(now, 4),
        time: "16:15",
      },
    ],
    completions: [
      {
        taskId: "water",
        date: today,
        completedAt: new Date(now.getTime()).toISOString(),
      },
      {
        taskId: "read",
        date: day(now, -1),
        completedAt: addDays(now, -1).toISOString(),
      },
      {
        taskId: "plan",
        date: day(now, -2),
        completedAt: addDays(now, -2).toISOString(),
      },
    ],
  };
}

export function parseDemoState(
  raw: string | null,
  now = Date.now(),
  locale?: "es" | "en",
) {
  if (!raw || raw.length > MAX_DEMO_STORAGE_BYTES) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      value.version !== 1 ||
      !isFiniteNumber(value.expiresAt) ||
      value.expiresAt <= now ||
      value.expiresAt > now + DEMO_TTL ||
      !isText(value.activeScheduleId) ||
      (value.locale !== undefined &&
        value.locale !== "es" &&
        value.locale !== "en") ||
      !isArrayOf(value.schedules, isSchedule) ||
      !isArrayOf(value.categories, isCategory) ||
      !isArrayOf(value.tasks, isTask) ||
      !isArrayOf(value.events, isEvent) ||
      !isArrayOf(value.completions, isCompletion)
    )
      return null;
    if (locale && value.locale && value.locale !== locale) return null;
    return value as DemoState;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isText(value: unknown, maxLength = 500): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function isArrayOf<T>(
  value: unknown,
  predicate: (item: unknown) => item is T,
): value is T[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_DEMO_ITEMS &&
    value.every(predicate)
  );
}

function isSchedule(value: unknown): value is DemoState["schedules"][number] {
  return (
    isRecord(value) &&
    isText(value.id, 100) &&
    isText(value.name) &&
    isText(value.emoji, 32)
  );
}

function isCategory(value: unknown): value is DemoState["categories"][number] {
  return (
    isRecord(value) &&
    isText(value.id, 100) &&
    isText(value.name) &&
    isText(value.emoji, 32) &&
    isText(value.color, 32)
  );
}

function isTask(value: unknown): value is DemoTask {
  return (
    isRecord(value) &&
    isText(value.id, 100) &&
    isText(value.title) &&
    isText(value.emoji, 32) &&
    isText(value.categoryId, 100) &&
    isText(value.scheduleId, 100) &&
    ["morning", "afternoon", "night", "anytime"].includes(
      String(value.dayPart),
    ) &&
    typeof value.archived === "boolean"
  );
}

function isEvent(value: unknown): value is DemoEvent {
  return (
    isRecord(value) &&
    isText(value.id, 100) &&
    isText(value.title) &&
    isText(value.emoji, 32) &&
    isText(value.date, 32) &&
    (value.time === undefined || isText(value.time, 16))
  );
}

function isCompletion(
  value: unknown,
): value is DemoState["completions"][number] {
  return (
    isRecord(value) &&
    isText(value.taskId, 100) &&
    isText(value.date, 32) &&
    isText(value.completedAt, 64)
  );
}

export function toggleDemoCompletion(
  state: DemoState,
  taskId: string,
  date: string,
): DemoState {
  const exists = state.completions.some(
    (item) => item.taskId === taskId && item.date === date,
  );
  return {
    ...state,
    completions: exists
      ? state.completions.filter(
          (item) => item.taskId !== taskId || item.date !== date,
        )
      : [
          ...state.completions,
          { taskId, date, completedAt: new Date().toISOString() },
        ],
  };
}
