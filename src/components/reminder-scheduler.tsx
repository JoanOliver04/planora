"use client";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "@/i18n/routing";
import { loadNotificationPreferences } from "@/features/reminders/preferences";
import {
  deliverNoticesOnce,
  type DueNotice,
} from "@/features/reminders/notices";
import { showPlanoraSystemNotification } from "@/features/reminders/system-notification";
import { startSoundPreview } from "@/lib/audio/shared-preview";
import type { Database } from "@/types/database";

type Reminder = Database["public"]["Tables"]["reminders"]["Row"];
type DueReminder = Pick<
  Reminder,
  | "id"
  | "task_id"
  | "event_id"
  | "kind"
  | "title"
  | "recurrence"
  | "timezone"
  | "next_trigger_at"
>;

function playAlarmSound() {
  if (document.visibilityState !== "visible") return;
  try {
    startSoundPreview({ volume: 1, soundId: "alarm" });
  } catch {
    // A missed alarm tone must not interrupt reminder delivery.
  }
}

function noticeContent(
  reminder: DueReminder,
  locale: string,
  taskCopy: Map<string, { emoji: string | null; title: string }>,
  eventCopy: Map<string, { emoji: string | null; title: string }>,
): Pick<
  DueNotice,
  "title" | "body" | "actionLabel" | "appPath" | "notificationPath"
> {
  let title = locale === "es" ? "Recordatorio de Planora" : "Planora reminder";
  let body =
    locale === "es"
      ? "Es hora de revisar tu planificación."
      : "It's time to check your plan.";
  let appPath = "/reminders";
  if (reminder.kind === "alarm") {
    title = locale === "es" ? "Alarma de Planora" : "Planora alarm";
    body = reminder.title ?? body;
  } else if (reminder.task_id) {
    const task = taskCopy.get(reminder.task_id);
    if (task) body = ((task.emoji ?? "") + " " + task.title).trim();
  } else if (reminder.event_id) {
    const event = eventCopy.get(reminder.event_id);
    if (event) body = ((event.emoji ?? "") + " " + event.title).trim();
  } else {
    title = locale === "es" ? "Tu resumen diario" : "Your daily summary";
    body =
      locale === "es"
        ? "Consulta lo que has completado, lo pendiente y tus eventos de hoy."
        : "Review what you completed, what remains and today's events.";
    appPath = "/summary";
  }
  const actionLabel =
    reminder.kind === "daily_summary"
      ? locale === "es"
        ? "Ver resumen"
        : "View summary"
      : locale === "es"
        ? "Abrir"
        : "Open";
  return {
    title,
    body,
    actionLabel,
    appPath,
    notificationPath: "/" + locale + appPath,
  };
}

export function ReminderScheduler({ locale }: { locale: string }) {
  const router = useRouter();
  const check = useCallback(async () => {
    if (!navigator.onLine) return;
    const db = createClient();
    const {
      data: { session },
    } = await db.auth.getSession();
    if (!session?.user) return;
    const { data: reminders } = await db
      .from("reminders")
      .select(
        "id,task_id,event_id,kind,title,recurrence,timezone,next_trigger_at",
      )
      .eq("enabled", true)
      .lte("next_trigger_at", new Date().toISOString())
      .order("next_trigger_at")
      .limit(20);
    if (!reminders?.length) return;

    const taskIds = [
      ...new Set(
        reminders
          .map((reminder) => reminder.task_id)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const eventIds = [
      ...new Set(
        reminders
          .map((reminder) => reminder.event_id)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const [taskResult, eventResult] = await Promise.all([
      taskIds.length
        ? db.from("tasks").select("id,title,emoji").in("id", taskIds)
        : Promise.resolve({ data: [], error: null }),
      eventIds.length
        ? db.from("events").select("id,title,emoji").in("id", eventIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const taskCopy = new Map(
      (taskResult.data ?? []).map((task) => [task.id, task]),
    );
    const eventCopy = new Map(
      (eventResult.data ?? []).map((event) => [event.id, event]),
    );
    const preferences = loadNotificationPreferences();
    const notices: DueNotice[] = reminders.map((reminder) => ({
      id: reminder.id,
      kind: reminder.kind,
      taskId: reminder.task_id,
      eventId: reminder.event_id,
      recurrence: reminder.recurrence,
      timezone: reminder.timezone,
      nextTriggerAt: reminder.next_trigger_at,
      ...noticeContent(reminder, locale, taskCopy, eventCopy),
    }));

    await deliverNoticesOnce({
      notices,
      preferences,
      visible: document.visibilityState !== "hidden",
      presentInApp: (notice) => {
        toast.info(notice.title, {
          id: notice.toast.id,
          description: notice.toast.description,
          duration: notice.toast.duration,
          closeButton: notice.toast.closeButton,
          className: notice.toast.className,
          action: {
            label: notice.actionLabel,
            onClick: () => {
              notice.onOpen();
              toast.dismiss(notice.toast.id);
              router.push(notice.appPath);
            },
          },
          onDismiss: () => notice.onDismiss(),
        });
      },
      presentSystem: (notice) =>
        showPlanoraSystemNotification({
          title: notice.title,
          body: notice.body,
          tag: notice.tag,
          url: notice.notificationPath,
          silent: notice.silent,
          requireInteraction: notice.requireInteraction,
        }),
      advance: async (notice, nextTriggerAt) => {
        const { error } = await db
          .from("reminders")
          .update({
            last_delivered_at: new Date().toISOString(),
            delivery_status: "delivered",
            snoozed_until: null,
            enabled: Boolean(nextTriggerAt),
            ...(nextTriggerAt ? { next_trigger_at: nextTriggerAt } : {}),
          })
          .eq("id", notice.id);
        if (error) throw new Error("advance_failed");
      },
      playAlarm: playAlarmSound,
      vibrate: () => {
        if ("vibrate" in navigator)
          navigator.vibrate([250, 120, 250, 120, 500]);
      },
    });
    window.dispatchEvent(new CustomEvent("planora-reminders-updated"));
  }, [locale, router]);

  useEffect(() => {
    const run = () => void check();
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    window.addEventListener("online", run);
    window.addEventListener("focus", run);
    window.addEventListener("planora-notification-preferences", run);
    document.addEventListener("visibilitychange", onVisible);
    const startup = window.setTimeout(run, 2_500);
    const timer = window.setInterval(run, 30_000);
    return () => {
      window.removeEventListener("online", run);
      window.removeEventListener("focus", run);
      window.removeEventListener("planora-notification-preferences", run);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearTimeout(startup);
      window.clearInterval(timer);
    };
  }, [check]);
  return null;
}
