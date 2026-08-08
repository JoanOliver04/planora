"use client";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { advanceTrigger } from "@/features/reminders/schedule";
import { loadNotificationPreferences } from "@/features/reminders/preferences";
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

function reminderType(reminder: DueReminder) {
  if (reminder.kind === "alarm") return "alarms" as const;
  if (reminder.kind === "daily_summary") return "summaries" as const;
  return reminder.event_id ? ("events" as const) : ("tasks" as const);
}

function playAlarmSound() {
  if (document.visibilityState !== "visible") return;
  try {
    const AudioContextClass =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.18, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.7);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.7);
    oscillator.addEventListener("ended", () => void context.close());
  } catch {
    // Browsers can block audio before the user interacts with the page.
  }
}

export function ReminderScheduler({ locale }: { locale: string }) {
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
    for (const reminder of reminders) {
      if (!preferences[reminderType(reminder)]) continue;
      let title =
        locale === "es" ? "Recordatorio de Planora" : "Planora reminder";
      let body =
        locale === "es"
          ? "Es hora de revisar tu planificación."
          : "It's time to check your plan.";
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
      }

      try {
        let delivered = false;
        if (preferences.inApp) {
          toast.info(title, {
            description: body,
            duration: reminder.kind === "alarm" ? 12_000 : 7_000,
            action: {
              label:
                reminder.kind === "daily_summary"
                  ? locale === "es"
                    ? "Ver resumen"
                    : "View summary"
                  : locale === "es"
                    ? "Abrir"
                    : "Open",
              onClick: () => {
                location.href =
                  "/" +
                  locale +
                  (reminder.kind === "daily_summary"
                    ? "/summary"
                    : "/reminders");
              },
            },
          });
          delivered = true;
        }
        if (
          preferences.system &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          const registration = await navigator.serviceWorker.ready;
          await registration.showNotification(title, {
            body,
            icon: "/icon-192.png",
            badge: "/icon-192.png",
            tag: "planora-reminder-" + reminder.id,
            requireInteraction: reminder.kind === "alarm",
            silent: !preferences.sound,
            data: {
              url:
                "/" +
                locale +
                (reminder.kind === "daily_summary" ? "/summary" : "/reminders"),
            },
          });
          delivered = true;
        }
        if (preferences.sound && reminder.kind === "alarm") playAlarmSound();
        if (
          preferences.vibration &&
          reminder.kind === "alarm" &&
          "vibrate" in navigator
        )
          navigator.vibrate([250, 120, 250, 120, 500]);

        if (!delivered) continue;
        const next = advanceTrigger(
          new Date(reminder.next_trigger_at),
          reminder.recurrence,
          reminder.timezone,
        );
        await db
          .from("reminders")
          .update({
            last_delivered_at: new Date().toISOString(),
            delivery_status: "delivered",
            snoozed_until: null,
            enabled: Boolean(next),
            ...(next ? { next_trigger_at: next.toISOString() } : {}),
          })
          .eq("id", reminder.id);
      } catch {
        await db
          .from("reminders")
          .update({ delivery_status: "failed" })
          .eq("id", reminder.id);
      }
    }
    window.dispatchEvent(new CustomEvent("planora-reminders-updated"));
  }, [locale]);

  useEffect(() => {
    const run = () => void check();
    window.addEventListener("online", run);
    window.addEventListener("focus", run);
    window.addEventListener("planora-notification-preferences", run);
    document.addEventListener("visibilitychange", run);
    queueMicrotask(run);
    const timer = window.setInterval(run, 30_000);
    return () => {
      window.removeEventListener("online", run);
      window.removeEventListener("focus", run);
      window.removeEventListener("planora-notification-preferences", run);
      document.removeEventListener("visibilitychange", run);
      window.clearInterval(timer);
    };
  }, [check]);
  return null;
}
