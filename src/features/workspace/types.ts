import type { Database, Json } from "@/types/database";
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Schedule = Database["public"]["Tables"]["schedules"]["Row"];
export type Category = Database["public"]["Tables"]["categories"]["Row"];
export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type Completion =
  Database["public"]["Tables"]["task_completions"]["Row"];
export type Event = Database["public"]["Tables"]["events"]["Row"];
export type WorkspaceData = {
  user: { id: string; email?: string };
  profile: Profile;
  schedules: Schedule[];
  categories: Category[];
  tasks: Task[];
  events: Event[];
  completions: Completion[];
};
export type WorkspaceMode =
  | "today"
  | "week"
  | "month"
  | "search"
  | "summary"
  | "tasks"
  | "events"
  | "history"
  | "statistics"
  | "schedules"
  | "categories"
  | "settings";
export type RecurrenceJson =
  | { type: "once" | "daily" }
  | { type: "weekdays"; weekdays: number[] }
  | { type: "times_per_week"; target: number }
  | { type: "interval"; every: number; unit: "day" | "week" | "month" };
export function recurrenceFromJson(
  value: Json,
  type: Task["recurrence_type"],
): RecurrenceJson {
  const v = (value ?? {}) as Record<string, unknown>;
  if (type === "weekdays")
    return {
      type,
      weekdays: Array.isArray(v.weekdays)
        ? (v.weekdays.filter((x) => Number.isInteger(x)) as number[])
        : [],
    };
  if (type === "times_per_week") return { type, target: Number(v.target) || 1 };
  if (type === "interval")
    return {
      type,
      every: Number(v.every) || 1,
      unit: v.unit === "week" || v.unit === "month" ? v.unit : "day",
    };
  return { type };
}
