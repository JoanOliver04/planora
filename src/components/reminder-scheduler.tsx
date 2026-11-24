"use client";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import {
  canPollPrivateSession,
  subscribeClientSession,
} from "@/lib/security/client-session";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "@/i18n/routing";
import { loadNotificationPreferences } from "@/features/reminders/preferences";
import {
  deliverNoticesOnce,
  type DueNotice,
} from "@/features/reminders/notices";
import { showPlanoraSystemNotification } from "@/features/reminders/system-notification";
import { effectiveReminderTrigger } from "@/features/reminders/schedule";
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

export function ReminderScheduler({
  locale,
  userId,
}: {
  locale: string;
  userId: string;
}) {
  const router = useRouter();
  const check = useCallback(
    async (signal: AbortSignal) => {
      const active = () => !signal.aborted && canPollPrivateSession(userId);
      if (!navigator.onLine || !active()) return;
      const db = createClient();
      const {
        data: { session },
      } = await db.auth.getSession();
      if (session?.user.id !== userId || !active()) return;
      // A server-managed occurrence must never also be consumed by a live tab.
      const { data: push, error: pushError } = await db
        .rpc("push_configuration")
        .abortSignal(signal);
      if (pushError || !active()) return;
      if (
        push &&
        typeof push === "object" &&
        !Array.isArray(push) &&
        push.managed === true
      )
        return;
      const preferences = loadNotificationPreferences();
      const channels = [
        preferences.alarms && "kind.eq.alarm",
        preferences.summaries && "kind.eq.daily_summary",
        preferences.tasks && "and(kind.eq.relative,task_id.not.is.null)",
        preferences.events && "and(kind.eq.relative,event_id.not.is.null)",
      ].filter(Boolean);
      if (!channels.length || (!preferences.inApp && !preferences.system))
        return;
      const now = new Date().toISOString();
      const { data: reminders } = await db
        .from("reminders")
        .select(
          "id,task_id,event_id,kind,title,recurrence,timezone,next_trigger_at,time_of_day,snoozed_until,updated_at",
        )
        .eq("enabled", true)
        .or(channels.join(","))
        .lte("next_trigger_at", now)
        .or("snoozed_until.is.null,snoozed_until.lte." + now)
        .order("next_trigger_at")
        .limit(20)
        .abortSignal(signal);
      if (!reminders?.length || !active()) return;

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
          ? db
              .from("tasks")
              .select("id,title,emoji")
              .in("id", taskIds)
              .abortSignal(signal)
          : Promise.resolve({ data: [], error: null }),
        eventIds.length
          ? db
              .from("events")
              .select("id,title,emoji")
              .in("id", eventIds)
              .abortSignal(signal)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (!active()) return;
      const taskCopy = new Map(
        (taskResult.data ?? []).map((task) => [task.id, task]),
      );
      const eventCopy = new Map(
        (eventResult.data ?? []).map((event) => [event.id, event]),
      );
      const reminderVersions = new Map(
        reminders.map(({ id, updated_at }) => [id, updated_at]),
      );
      const notices: DueNotice[] = reminders.map((reminder) => ({
        id: reminder.id,
        kind: reminder.kind,
        taskId: reminder.task_id,
        eventId: reminder.event_id,
        recurrence: reminder.recurrence,
        timezone: reminder.timezone,
        nextTriggerAt: effectiveReminderTrigger(
          reminder.next_trigger_at,
          reminder.snoozed_until,
        ),
        scheduledTriggerAt: reminder.next_trigger_at,
        timeOfDay: reminder.time_of_day,
        ...noticeContent(reminder, locale, taskCopy, eventCopy),
      }));

      await deliverNoticesOnce({
        signal,
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
        advance: async (notice, nextTriggerAt, outcome) => {
          const version = reminderVersions.get(notice.id);
          if (!version || !active()) return;
          const { error } = await db
            .from("reminders")
            .update({
              ...(outcome === "delivered"
                ? {
                    last_delivered_at: new Date().toISOString(),
                    delivery_status: "delivered",
                  }
                : { delivery_status: "pending" }),
              snoozed_until: null,
              enabled: Boolean(nextTriggerAt),
              ...(nextTriggerAt ? { next_trigger_at: nextTriggerAt } : {}),
            })
            .eq("id", notice.id)
            .eq("updated_at", version)
            .eq("enabled", true)
            .abortSignal(signal);
          if (error) throw new Error("advance_failed");
        },
        playAlarm: playAlarmSound,
        vibrate: () => {
          if ("vibrate" in navigator)
            navigator.vibrate([250, 120, 250, 120, 500]);
        },
      });
      if (active())
        window.dispatchEvent(new CustomEvent("planora-reminders-updated"));
    },
    [locale, router, userId],
  );

  useEffect(() => {
    let flight: AbortController | undefined;
    let mounted = true;
    const run = () => {
      if (!mounted || flight || !canPollPrivateSession(userId)) return;
      const controller = new AbortController();
      flight = controller;
      void check(controller.signal)
        .catch(() => {
          if (controller.signal.aborted) return;
          console.info("planora.notification", {
            phase: "poll",
            errorType: "unavailable",
          });
        })
        .finally(() => {
          if (flight === controller) flight = undefined;
        });
    };
    const stop = () => {
      flight?.abort();
      flight = undefined;
    };
    const unsubscribe = subscribeClientSession(() => {
      if (canPollPrivateSession(userId)) run();
      else stop();
    });
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
      mounted = false;
      unsubscribe();
      stop();
      window.removeEventListener("online", run);
      window.removeEventListener("focus", run);
      window.removeEventListener("planora-notification-preferences", run);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearTimeout(startup);
      window.clearInterval(timer);
    };
  }, [check, userId]);
  return null;
}
