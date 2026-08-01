"use client";
import { useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { advanceTrigger } from "@/features/reminders/schedule";

export function ReminderScheduler({ locale }: { locale: string }) {
  const check = useCallback(async () => {
    if (
      !navigator.onLine ||
      !("Notification" in window) ||
      Notification.permission === "default"
    )
      return;
    const db = createClient();
    const {
      data: { session },
    } = await db.auth.getSession();
    if (!session?.user) return;
    const { data: reminders } = await db
      .from("reminders")
      .select("*")
      .eq("enabled", true)
      .lte("next_trigger_at", new Date().toISOString())
      .order("next_trigger_at")
      .limit(20);
    if (!reminders?.length) return;
    for (const reminder of reminders) {
      if (Notification.permission === "denied") {
        await db
          .from("reminders")
          .update({ delivery_status: "permission_denied" })
          .eq("id", reminder.id);
        continue;
      }
      let title =
        locale === "es" ? "Recordatorio de Planora" : "Planora reminder";
      let body =
        locale === "es"
          ? "Es hora de revisar tu planificación."
          : "It's time to check your plan.";
      if (reminder.task_id) {
        const { data: task } = await db
          .from("tasks")
          .select("title,emoji")
          .eq("id", reminder.task_id)
          .maybeSingle();
        if (task) body = (task.emoji ?? "") + " " + task.title;
      } else if (reminder.event_id) {
        const { data: event } = await db
          .from("events")
          .select("title,emoji")
          .eq("id", reminder.event_id)
          .maybeSingle();
        if (event) body = (event.emoji ?? "") + " " + event.title;
      } else {
        title = locale === "es" ? "Tu resumen diario" : "Your daily summary";
      }
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(title, {
          body,
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: "planora-reminder-" + reminder.id,
          data: { url: "/" + locale + "/today" },
        });
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
    const online = () => void check();
    window.addEventListener("online", online);
    queueMicrotask(online);
    const timer = window.setInterval(online, 60_000);
    return () => {
      window.removeEventListener("online", online);
      window.clearInterval(timer);
    };
  }, [check]);
  return null;
}
