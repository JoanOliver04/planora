import { addDays, format } from "date-fns";

export const DEMO_TTL = 24 * 60 * 60 * 1000;
export const DEMO_STORAGE_KEY = "planora-demo-v1";

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

export function createDemoState(now = new Date()): DemoState {
  const today = day(now, 0);
  return {
    version: 1,
    expiresAt: now.getTime() + DEMO_TTL,
    activeScheduleId: "schedule-normal",
    schedules: [
      { id: "schedule-normal", name: "Normal", emoji: "🌿" },
      { id: "schedule-focus", name: "Semana de enfoque", emoji: "🎯" },
    ],
    categories: [
      { id: "health", name: "Bienestar", emoji: "🌱", color: "#4f6b45" },
      { id: "study", name: "Estudios", emoji: "📚", color: "#2563eb" },
      { id: "work", name: "Trabajo", emoji: "💼", color: "#7c3aed" },
      { id: "personal", name: "Personal", emoji: "✨", color: "#c2410c" },
    ],
    tasks: [
      {
        id: "water",
        title: "Beber agua al despertar",
        emoji: "💧",
        categoryId: "health",
        scheduleId: "schedule-normal",
        dayPart: "morning",
        archived: false,
      },
      {
        id: "plan",
        title: "Revisar prioridades del día",
        emoji: "🧭",
        categoryId: "work",
        scheduleId: "schedule-normal",
        dayPart: "morning",
        archived: false,
      },
      {
        id: "focus",
        title: "Sesión de trabajo profundo",
        emoji: "🎯",
        categoryId: "work",
        scheduleId: "schedule-normal",
        dayPart: "afternoon",
        archived: false,
      },
      {
        id: "read",
        title: "Leer 20 minutos",
        emoji: "📖",
        categoryId: "study",
        scheduleId: "schedule-normal",
        dayPart: "night",
        archived: false,
      },
      {
        id: "walk",
        title: "Paseo sin móvil",
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
        title: "Revisión semanal",
        emoji: "📊",
        date: today,
        time: "17:30",
      },
      {
        id: "presentation",
        title: "Presentación del proyecto",
        emoji: "🚀",
        date: day(now, 2),
        time: "10:00",
      },
      {
        id: "dentist",
        title: "Dentista",
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

export function parseDemoState(raw: string | null, now = Date.now()) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<DemoState>;
    if (
      value.version !== 1 ||
      typeof value.expiresAt !== "number" ||
      value.expiresAt <= now ||
      !Array.isArray(value.tasks) ||
      !Array.isArray(value.events)
    )
      return null;
    return value as DemoState;
  } catch {
    return null;
  }
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
