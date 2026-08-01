"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { taskSchema } from "@/lib/validation/task";
import { preferencesSchema } from "@/lib/validation/preferences";
import { z } from "zod";
import { getTemplate } from "@/features/templates/catalog";
import type { Json } from "@/types/database";
import { nextDailyTrigger } from "@/features/reminders/schedule";
import { backupSchema, summarizeBackup } from "@/features/backup/format";
const id = z.string().uuid();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const dayPartSettingsSchema = z.object({
  morning: z.object({ start: time, end: time }),
  afternoon: z.object({ start: time, end: time }),
  night: z.object({ start: time, end: time }),
});
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
  day_part_settings: dayPartSettingsSchema.optional(),
  onboarding_completed: z.boolean().optional(),
  active_schedule_id: id.optional(),
  preferences: preferencesSchema.optional(),
});
const guidedOnboardingSchema = z.object({
  goal: z.enum(["studies", "work", "habits", "personal"]),
  scheduleName: z.string().trim().min(1).max(80),
  timezone: z.string().min(1).max(100),
  weekStart: z.union([z.literal(0), z.literal(1)]),
  accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  skip: z.boolean().default(false),
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
export async function completeGuidedOnboarding(input: unknown) {
  const value = guidedOnboardingSchema.parse(input);
  const { db } = await auth();
  const { error } = await db.rpc("complete_guided_onboarding", {
    goal: value.goal,
    schedule_name: value.scheduleName,
    detected_timezone: value.timezone,
    week_start: value.weekStart,
    accent_colour: value.accent,
    skip_setup: value.skip,
  });
  if (error) throw new Error("Unable to complete onboarding");
  refresh();
}
const templateImportSchema = z.object({
  templateId: z.string().min(1).max(120),
  locale: z.enum(["es", "en"]),
  requestId: z.string().uuid(),
  categories: z.boolean(),
  tasks: z.boolean(),
  personal: z.boolean().default(false),
});
export async function importTemplate(input: unknown) {
  const value = templateImportSchema.parse(input);
  const { db, user } = await auth();
  let content: Json;
  if (value.personal) {
    const { data, error } = await db
      .from("schedule_templates")
      .select("content")
      .eq("id", id.parse(value.templateId))
      .eq("user_id", user.id)
      .single();
    if (error || !data) throw new Error("Template not found");
    content = data.content;
  } else {
    const template = getTemplate(value.templateId);
    if (!template) throw new Error("Template not found");
    content = {
      name: template.name[value.locale],
      emoji: template.emoji,
      categories: template.categories.map((category) => ({
        key: category.key,
        name: category.name[value.locale],
        colour: category.colour,
        emoji: category.emoji,
      })),
      tasks: template.tasks.map((task) => ({
        title: task.title[value.locale],
        emoji: task.emoji,
        categoryKey: task.categoryKey,
        recurrence: task.recurrence,
        config:
          task.recurrence === "weekdays"
            ? { weekdays: [1, 2, 3, 4, 5] }
            : task.recurrence === "times_per_week"
              ? { target: task.target ?? 1 }
              : {},
      })),
    };
  }
  const { error } = await db.rpc("import_schedule_template", {
    request_id: value.requestId,
    template_key:
      (value.personal ? "personal:" : "builtin:") + value.templateId,
    template_content: content,
    include_categories: value.categories,
    include_tasks: value.tasks,
  });
  if (error) throw new Error("Unable to import template");
  refresh();
}
export async function savePersonalTemplate(input: unknown) {
  const value = z
    .object({ scheduleId: id, name: z.string().trim().min(1).max(80) })
    .parse(input);
  const { db } = await auth();
  const { error } = await db.rpc("save_personal_template", {
    source_schedule_id: value.scheduleId,
    template_name: value.name,
  });
  if (error) throw new Error("Unable to save template");
  refresh();
}
export async function reorderResources(input: unknown) {
  const value = z
    .object({
      type: z.enum(["tasks", "categories", "schedules"]),
      ids: z
        .array(id)
        .min(1)
        .max(500)
        .refine((ids) => new Set(ids).size === ids.length),
    })
    .parse(input);
  const { db } = await auth();
  const { error } = await db.rpc("reorder_resources", {
    resource_type: value.type,
    ordered_ids: value.ids,
  });
  if (error) throw new Error("Unable to save order");
  refresh();
}
const reminderSchema = z.object({
  id: id.optional(),
  targetType: z.enum(["task", "event", "summary"]),
  targetId: id.optional().nullable(),
  minutesBefore: z.number().int().min(0).max(10080).optional().nullable(),
  recurrence: z.enum(["once", "daily", "weekly"]),
  timeOfDay: time.optional().nullable(),
  timezone: z
    .string()
    .min(1)
    .max(100)
    .refine((value) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }),
  nextTriggerAt: z.string().datetime(),
  enabled: z.boolean(),
});
export async function saveReminder(input: unknown) {
  const value = reminderSchema.parse(input);
  if (value.targetType !== "summary" && !value.targetId)
    throw new Error("Reminder target is required");
  const { db, user } = await auth();
  const payload = {
    user_id: user.id,
    task_id: value.targetType === "task" ? value.targetId : null,
    event_id: value.targetType === "event" ? value.targetId : null,
    kind:
      value.targetType === "summary"
        ? ("daily_summary" as const)
        : ("relative" as const),
    minutes_before: value.targetType === "summary" ? null : value.minutesBefore,
    recurrence:
      value.targetType === "summary" ? ("daily" as const) : value.recurrence,
    time_of_day: value.targetType === "summary" ? value.timeOfDay : null,
    timezone: value.timezone,
    next_trigger_at: value.nextTriggerAt,
    enabled: value.enabled,
    delivery_status: "pending" as const,
    snoozed_until: null,
  };
  if (value.targetType === "summary" && !value.id) {
    const { data: existing } = await db
      .from("reminders")
      .select("id")
      .eq("kind", "daily_summary")
      .maybeSingle();
    if (existing?.id) value.id = existing.id;
  }
  const result = value.id
    ? await db
        .from("reminders")
        .update(payload)
        .eq("id", value.id)
        .eq("user_id", user.id)
    : await db.from("reminders").insert(payload);
  if (result.error) throw new Error("Unable to save reminder");
  refresh();
}
export async function snoozeReminder(input: unknown) {
  const value = z
    .object({ id, minutes: z.number().int().min(5).max(1440) })
    .parse(input);
  const { db, user } = await auth();
  const until = new Date(Date.now() + value.minutes * 60_000).toISOString();
  const { error } = await db
    .from("reminders")
    .update({
      snoozed_until: until,
      next_trigger_at: until,
      delivery_status: "snoozed",
    })
    .eq("id", value.id)
    .eq("user_id", user.id);
  if (error) throw new Error("Unable to snooze reminder");
  refresh();
}
export async function deleteReminder(value: string) {
  const { db, user } = await auth();
  const { error } = await db
    .from("reminders")
    .delete()
    .eq("id", id.parse(value))
    .eq("user_id", user.id);
  if (error) throw new Error("Unable to delete reminder");
  refresh();
}
export async function updateReminderTimezone(input: unknown) {
  const value = z
    .object({ timezone: reminderSchema.shape.timezone })
    .parse(input);
  const { db, user } = await auth();
  const { data: reminders, error: readError } = await db
    .from("reminders")
    .select("id,kind,time_of_day")
    .eq("user_id", user.id);
  if (readError) throw new Error("Unable to update reminder timezone");
  for (const reminder of reminders ?? []) {
    const { error } = await db
      .from("reminders")
      .update({
        timezone: value.timezone,
        delivery_status: "pending",
        ...(reminder.kind === "daily_summary" && reminder.time_of_day
          ? {
              next_trigger_at: nextDailyTrigger(
                reminder.time_of_day.slice(0, 5),
                value.timezone,
              ).toISOString(),
            }
          : {}),
      })
      .eq("id", reminder.id)
      .eq("user_id", user.id);
    if (error) throw new Error("Unable to update reminder timezone");
  }
  const { error: profileError } = await db
    .from("profiles")
    .update({ timezone: value.timezone })
    .eq("id", user.id);
  if (profileError) throw new Error("Unable to update reminder timezone");
  refresh();
}
export async function setRemindersEnabled(value: boolean) {
  const enabled = z.boolean().parse(value);
  const { db, user } = await auth();
  const { error } = await db
    .from("reminders")
    .update({
      enabled,
      delivery_status: "pending",
    })
    .eq("user_id", user.id);
  if (error) throw new Error("Unable to update reminders");
  refresh();
}
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
    ? db.from("schedules").update(payload).eq("id", v.id).eq("user_id", user.id)
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
    shouldArchive = z.boolean().parse(archived),
    { db, user } = await auth();
  const { error } = await db
    .from("schedules")
    .update({ is_archived: shouldArchive })
    .eq("id", scheduleId)
    .eq("user_id", user.id);
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
    ? await db
        .from("categories")
        .update(payload)
        .eq("id", v.id)
        .eq("user_id", user.id)
    : await db.from("categories").insert(payload);
  if (error) throw new Error("Unable to save category");
  refresh();
}
export async function deleteCategory(value: string, reassignTo: string | null) {
  const categoryId = id.parse(value),
    target = reassignTo ? id.parse(reassignTo) : null,
    { db, user } = await auth();
  const [{ count: taskCount }, { count: eventCount }] = await Promise.all([
    db
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("category_id", categoryId)
      .eq("user_id", user.id),
    db
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("category_id", categoryId)
      .eq("user_id", user.id),
  ]);
  if (((taskCount ?? 0) > 0 || (eventCount ?? 0) > 0) && !target)
    throw new Error("Reassign tasks and events first");
  if (target) {
    const [{ error: taskError }, { error: eventError }] = await Promise.all([
      db
        .from("tasks")
        .update({ category_id: target })
        .eq("category_id", categoryId)
        .eq("user_id", user.id),
      db
        .from("events")
        .update({ category_id: target })
        .eq("category_id", categoryId)
        .eq("user_id", user.id),
    ]);
    if (taskError || eventError)
      throw new Error("Unable to reassign category items");
  }
  const { error } = await db
    .from("categories")
    .delete()
    .eq("id", categoryId)
    .eq("user_id", user.id);
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
    ? await db
        .from("tasks")
        .update(payload)
        .eq("id", id.parse(taskId))
        .eq("user_id", user.id)
    : await db.from("tasks").insert(payload);
  if (error) throw new Error("Unable to save task");
  refresh();
}
export async function setTaskArchived(value: string, archived: boolean) {
  const taskId = id.parse(value),
    shouldArchive = z.boolean().parse(archived),
    { db, user } = await auth();
  const { error } = await db
    .from("tasks")
    .update({
      archived_at: shouldArchive ? new Date().toISOString() : null,
      is_active: !shouldArchive,
    })
    .eq("id", taskId)
    .eq("user_id", user.id);
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
    .eq("user_id", user.id)
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
    ? await db
        .from("events")
        .update(payload)
        .eq("id", v.id)
        .eq("user_id", user.id)
    : await db.from("events").insert(payload);
  if (error) throw new Error("Unable to save event");
  refresh();
}
export async function deleteEvent(value: string) {
  const { db, user } = await auth();
  const { error } = await db
    .from("events")
    .delete()
    .eq("id", id.parse(value))
    .eq("user_id", user.id);
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
    shouldIncludeTasks = z.boolean().parse(includeTasks),
    { db, user } = await auth(),
    { data: s, error } = await db
      .from("schedules")
      .select("*")
      .eq("id", scheduleId)
      .eq("user_id", user.id)
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
  if (shouldIncludeTasks) {
    const { data: tasks, error: tasksError } = await db
      .from("tasks")
      .select("*")
      .eq("schedule_id", scheduleId)
      .eq("user_id", user.id);
    if (tasksError) {
      await db
        .from("schedules")
        .delete()
        .eq("id", copy.id)
        .eq("user_id", user.id);
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
        await db
          .from("schedules")
          .delete()
          .eq("id", copy.id)
          .eq("user_id", user.id);
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
      .eq("schedule_id", scheduleId)
      .eq("user_id", user.id),
    db
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("schedule_id", scheduleId)
      .eq("user_id", user.id),
  ]);
  if (tasks || events) throw new Error("Only empty schedules can be deleted");
  const { error } = await db
    .from("schedules")
    .delete()
    .eq("id", scheduleId)
    .eq("user_id", user.id);
  if (error) throw new Error("Unable to delete schedule");
  refresh();
}

export async function restoreBackup(input: unknown) {
  const backup = backupSchema.parse(input);
  const { db, user } = await auth();
  const ids = new Map<string, string>();
  const mapped = (value: unknown) => typeof value === "string" ? ids.get(value) ?? null : null;
  const fresh = (value: unknown) => { const next = crypto.randomUUID(); if (typeof value === "string") ids.set(value, next); return next; };
  const clean = (item: Record<string, unknown>, allowed: string[]) => Object.fromEntries(allowed.filter((key) => key in item).map((key) => [key, item[key]]));
  const schedules = backup.data.schedules.map((item) => ({ ...clean(item, ["name", "description", "emoji", "is_archived", "sort_order"]), id: fresh(item.id), user_id: user.id }));
  const categories = backup.data.categories.map((item) => ({ ...clean(item, ["name", "colour", "emoji", "sort_order"]), id: fresh(item.id), user_id: user.id }));
  const tasks = backup.data.tasks.map((item) => ({ ...clean(item, ["title", "description", "emoji", "task_kind", "recurrence_type", "recurrence_config", "time_mode", "day_part", "start_time", "end_time", "start_date", "end_date", "is_active", "sort_order", "archived_at"]), id: fresh(item.id), user_id: user.id, schedule_id: mapped(item.schedule_id), category_id: mapped(item.category_id) }));
  const events = backup.data.events.map((item) => ({ ...clean(item, ["title", "description", "emoji", "event_date", "all_day", "start_time", "end_time"]), id: fresh(item.id), user_id: user.id, schedule_id: mapped(item.schedule_id), category_id: mapped(item.category_id) }));
  const completions = backup.data.completions.flatMap((item) => { const taskId = mapped(item.task_id); return taskId ? [{ ...clean(item, ["occurrence_date", "completed_at", "task_snapshot"]), id: crypto.randomUUID(), user_id: user.id, task_id: taskId }] : []; });
  const templates = backup.data.templates.map((item) => ({ ...clean(item, ["emoji", "content"]), id: crypto.randomUUID(), user_id: user.id, name: String(item.name ?? "Imported template").slice(0, 65) + " (imported)" }));
  const reminders = backup.data.reminders.flatMap((item) => { const taskId = mapped(item.task_id), eventId = mapped(item.event_id); if (item.kind !== "daily_summary" && !taskId && !eventId) return []; return [{ ...clean(item, ["kind", "minutes_before", "recurrence", "time_of_day", "timezone", "next_trigger_at"]), id: crypto.randomUUID(), user_id: user.id, task_id: taskId, event_id: eventId, enabled: false, delivery_status: "pending" as const, snoozed_until: null }]; });
  const inserts = [["schedules", schedules], ["categories", categories], ["tasks", tasks], ["events", events], ["task_completions", completions], ["schedule_templates", templates], ["reminders", reminders]] as const;
  for (const [table, rows] of inserts) { if (!rows.length) continue; const { error } = await db.from(table).insert(rows as never); if (error) throw new Error("Restore failed while importing " + table); }
  const profile = backup.data.profile;
  if (profile) await db.from("profiles").update({ ...clean(profile, ["locale", "timezone", "theme", "week_starts_on", "day_part_settings", "preferences"]), active_schedule_id: mapped(profile.active_schedule_id) }).eq("id", user.id);
  refresh();
  return summarizeBackup(backup);
}
