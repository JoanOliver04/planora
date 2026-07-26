"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { taskSchema } from "@/lib/validation/task";
import { z } from "zod";
const id = z.string().uuid();
const scheduleSchema = z.object({
  id: id.optional(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional().nullable(),
  emoji: z.string().max(16).optional().nullable(),
});
const categorySchema = z.object({
  id: id.optional(),
  name: z.string().trim().min(1).max(60),
  colour: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  emoji: z.string().max(16).optional().nullable(),
});
const eventSchema = z
  .object({
    id: id.optional(),
    title: z.string().trim().min(1).max(140),
    description: z.string().max(2000).optional().nullable(),
    emoji: z.string().max(16).optional().nullable(),
    categoryId: id.optional().nullable(),
    scheduleId: id.optional().nullable(),
    eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    allDay: z.boolean(),
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional()
      .nullable(),
    endTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional()
      .nullable(),
  })
  .superRefine((v, c) => {
    if (!v.allDay && !v.startTime)
      c.addIssue({
        code: "custom",
        path: ["startTime"],
        message: "Start time is required",
      });
    if (v.startTime && v.endTime && v.startTime >= v.endTime)
      c.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "End time must be later",
      });
  });
const profileSchema = z.object({
  locale: z.enum(["es", "en"]).optional(),
  timezone: z
    .string()
    .min(1)
    .max(100)
    .refine((v) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, "Invalid timezone")
    .optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  week_starts_on: z.number().int().min(0).max(6).optional(),
  day_part_settings: z.record(z.unknown()).optional(),
  onboarding_completed: z.boolean().optional(),
  active_schedule_id: id.optional(),
});
async function auth() {
  const db = await createClient(),
    {
      data: { user },
    } = await db.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return { db, user };
}
const refresh = () => revalidatePath("/", "layout");
export async function saveSchedule(input: unknown) {
  const v = scheduleSchema.parse(input),
    { db, user } = await auth();
  const payload = {
    user_id: user.id,
    name: v.name,
    description: v.description ?? null,
    emoji: v.emoji ?? null,
  };
  const q = v.id
    ? db.from("schedules").update(payload).eq("id", v.id)
    : db.from("schedules").insert(payload).select("id").single();
  const { data, error } = await q;
  if (error) throw new Error("Unable to save schedule");
  refresh();
  return data;
}
export async function setActiveSchedule(value: string) {
  const scheduleId = id.parse(value),
    { db, user } = await auth();
  const { error } = await db
    .from("profiles")
    .update({ active_schedule_id: scheduleId })
    .eq("id", user.id);
  if (error) throw new Error("Unable to switch schedule");
  refresh();
}
export async function setScheduleArchived(value: string, archived: boolean) {
  const scheduleId = id.parse(value),
    { db } = await auth();
  const { error } = await db
    .from("schedules")
    .update({ is_archived: archived })
    .eq("id", scheduleId);
  if (error) throw new Error("Unable to update schedule");
  refresh();
}
export async function saveCategory(input: unknown) {
  const v = categorySchema.parse(input),
    { db, user } = await auth();
  const payload = {
    user_id: user.id,
    name: v.name,
    colour: v.colour,
    emoji: v.emoji ?? null,
  };
  const { error } = v.id
    ? await db.from("categories").update(payload).eq("id", v.id)
    : await db.from("categories").insert(payload);
  if (error) throw new Error("Unable to save category");
  refresh();
}
export async function deleteCategory(value: string, reassignTo: string | null) {
  const categoryId = id.parse(value),
    target = reassignTo ? id.parse(reassignTo) : null,
    { db } = await auth();
  const { count } = await db
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("category_id", categoryId);
  if (count && count > 0 && !target) throw new Error("Reassign tasks first");
  if (target) {
    const { error } = await db
      .from("tasks")
      .update({ category_id: target })
      .eq("category_id", categoryId);
    if (error) throw new Error("Unable to reassign tasks");
  }
  const { error } = await db.from("categories").delete().eq("id", categoryId);
  if (error) throw new Error("Unable to delete category");
  refresh();
}
export async function saveTask(input: unknown, taskId?: string) {
  const v = taskSchema.parse(input),
    { db, user } = await auth(),
    r = v.recurrence,
    t = v.timing;
  const payload = {
    user_id: user.id,
    schedule_id: v.scheduleId,
    category_id: v.categoryId ?? null,
    title: v.title,
    description: v.description ?? null,
    emoji: v.emoji ?? null,
    task_kind: r.type === "once" ? ("one_time" as const) : ("habit" as const),
    recurrence_type: r.type,
    recurrence_config: r,
    time_mode: t.mode,
    day_part: t.mode === "day_part" ? t.dayPart : null,
    start_time:
      t.mode === "specific_time" || t.mode === "time_range"
        ? t.startTime
        : null,
    end_time: t.mode === "time_range" ? t.endTime : null,
    start_date: v.startDate,
    end_date: v.endDate ?? null,
    is_active: true,
  };
  const { error } = taskId
    ? await db.from("tasks").update(payload).eq("id", id.parse(taskId))
    : await db.from("tasks").insert(payload);
  if (error) throw new Error("Unable to save task");
  refresh();
}
export async function setTaskArchived(value: string, archived: boolean) {
  const taskId = id.parse(value),
    { db } = await auth();
  const { error } = await db
    .from("tasks")
    .update({
      archived_at: archived ? new Date().toISOString() : null,
      is_active: !archived,
    })
    .eq("id", taskId);
  if (error) throw new Error("Unable to update task");
  refresh();
}
export async function duplicateTask(value: string) {
  const taskId = id.parse(value),
    { db, user } = await auth();
  const { data, error } = await db
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .single();
  if (error || !data) throw new Error("Task not found");
  const { id: _id, created_at: _c, updated_at: _u, ...copy } = data;
  void _id;
  void _c;
  void _u;
  const { error: insertError } = await db
    .from("tasks")
    .insert({ ...copy, user_id: user.id, title: `${data.title} (copy)` });
  if (insertError) throw new Error("Unable to duplicate task");
  refresh();
}
export async function saveEvent(input: unknown) {
  const v = eventSchema.parse(input),
    { db, user } = await auth();
  const payload = {
    user_id: user.id,
    title: v.title,
    description: v.description ?? null,
    emoji: v.emoji ?? null,
    category_id: v.categoryId ?? null,
    schedule_id: v.scheduleId ?? null,
    event_date: v.eventDate,
    all_day: v.allDay,
    start_time: v.allDay ? null : (v.startTime ?? null),
    end_time: v.allDay ? null : (v.endTime ?? null),
  };
  const { error } = v.id
    ? await db.from("events").update(payload).eq("id", v.id)
    : await db.from("events").insert(payload);
  if (error) throw new Error("Unable to save event");
  refresh();
}
export async function deleteEvent(value: string) {
  const { db } = await auth();
  const { error } = await db.from("events").delete().eq("id", id.parse(value));
  if (error) throw new Error("Unable to delete event");
  refresh();
}
export async function updateProfile(input: unknown) {
  const v = profileSchema.parse(input),
    { db, user } = await auth();
  const { error } = await db.from("profiles").update(v).eq("id", user.id);
  if (error) throw new Error("Unable to update profile");
  refresh();
}

export async function duplicateSchedule(value: string, includeTasks: boolean) {
  const scheduleId = id.parse(value),
    { db, user } = await auth(),
    { data: s, error } = await db
      .from("schedules")
      .select("*")
      .eq("id", scheduleId)
      .single();
  if (error || !s) throw new Error("Schedule not found");
  const { data: copy, error: createError } = await db
    .from("schedules")
    .insert({
      user_id: user.id,
      name: `${s.name} (copy)`,
      description: s.description,
      emoji: s.emoji,
    })
    .select("id")
    .single();
  if (createError) throw new Error("Unable to duplicate schedule");
  if (includeTasks) {
    const { data: tasks, error: tasksError } = await db
      .from("tasks")
      .select("*")
      .eq("schedule_id", scheduleId);
    if (tasksError) {
      await db.from("schedules").delete().eq("id", copy.id);
      throw new Error("Unable to copy tasks");
    }
    if (tasks?.length) {
      const payload = tasks.map(
          ({
            id: _id,
            created_at: _created,
            updated_at: _updated,
            ...task
          }) => {
            void _id;
            void _created;
            void _updated;
            return {
              ...task,
              user_id: user.id,
              schedule_id: copy.id,
              archived_at: null,
              is_active: true,
            };
          },
        ),
        { error: insertError } = await db.from("tasks").insert(payload);
      if (insertError) {
        await db.from("schedules").delete().eq("id", copy.id);
        throw new Error("Unable to copy tasks");
      }
    }
  }
  refresh();
}
export async function deleteEmptySchedule(value: string) {
  const scheduleId = id.parse(value),
    { db, user } = await auth(),
    { data: profile } = await db
      .from("profiles")
      .select("active_schedule_id")
      .eq("id", user.id)
      .single();
  if (profile?.active_schedule_id === scheduleId)
    throw new Error("Switch schedules first");
  const [{ count: tasks }, { count: events }] = await Promise.all([
    db
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("schedule_id", scheduleId),
    db
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("schedule_id", scheduleId),
  ]);
  if (tasks || events) throw new Error("Only empty schedules can be deleted");
  const { error } = await db.from("schedules").delete().eq("id", scheduleId);
  if (error) throw new Error("Unable to delete schedule");
  refresh();
}
