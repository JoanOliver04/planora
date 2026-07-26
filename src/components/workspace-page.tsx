"use client";
import { useEffect, useState, useTransition } from "react";
import { WorkspaceSkeleton } from "@/components/workspace-skeleton";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { setActiveSchedule } from "@/app/actions/domain";
import { useWorkspace } from "@/features/workspace/use-workspace";
import {
  TodayView,
  WeekView,
  TasksView,
  HistoryView,
} from "@/features/workspace/task-views";
import {
  CategoriesView,
  EventsView,
  SchedulesView,
  SettingsView,
} from "@/features/workspace/resource-views";
export function WorkspacePage({
  mode,
}: {
  mode:
    | "today"
    | "week"
    | "tasks"
    | "events"
    | "history"
    | "schedules"
    | "categories"
    | "settings";
}) {
  const t = useTranslations("Workspace"),
    { db, data, loading, error, reload } = useWorkspace(),
    [starters, setStarters] = useState(true),
    [starting, setStarting] = useState(false),
    [switchingSchedule, startScheduleTransition] = useTransition(),
    [, setClock] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setClock((v) => v + 1), 60000);
    return () => clearInterval(timer);
  }, []);
  if (loading) return <WorkspaceSkeleton />;
  if (error || !data)
    return (
      <div className="empty surface" role="alert">
        <h1>{t("loadError")}</h1>
        <button className="primary" onClick={() => void reload()}>
          {t("retry")}
        </button>
      </div>
    );
  async function onboard() {
    setStarting(true);
    try {
      const timezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Madrid";
      const { error: onboardingError } = await db.rpc("complete_onboarding", {
        include_starters: starters,
        detected_timezone: timezone,
      });
      if (onboardingError) throw onboardingError;
      await reload();
    } catch (onboardingError) {
      toast.error(
        onboardingError instanceof Error ? onboardingError.message : t("error"),
      );
    } finally {
      setStarting(false);
    }
  }
  if (!data.profile.onboarding_completed || !data.schedules.length)
    return (
      <div className="onboarding">
        <section className="surface onboarding-card">
          <div className="resource-emoji">🌿</div>
          <h1 className="title">{t("welcome")}</h1>
          <p className="muted">{t("onboardingHint")}</p>
          <label className="check-row">
            <input
              type="checkbox"
              checked={starters}
              onChange={(e) => setStarters(e.target.checked)}
            />
            {t("starterCategories")}
          </label>
          <button
            className="primary"
            disabled={starting}
            onClick={() => void onboard()}
          >
            {t("start")}
          </button>
        </section>
      </div>
    );
  const active = data.schedules.find(
    (s) => s.id === data.profile.active_schedule_id,
  );
  const content =
    mode === "today" ? (
      <TodayView data={data} db={db} reload={reload} />
    ) : mode === "week" ? (
      <WeekView data={data} />
    ) : mode === "tasks" ? (
      <TasksView data={data} reload={reload} />
    ) : mode === "events" ? (
      <EventsView data={data} reload={reload} />
    ) : mode === "history" ? (
      <HistoryView data={data} />
    ) : mode === "schedules" ? (
      <SchedulesView data={data} reload={reload} />
    ) : mode === "categories" ? (
      <CategoriesView data={data} reload={reload} />
    ) : (
      <SettingsView data={data} db={db} reload={reload} />
    );
  return (
    <>
      <div className="schedule-bar">
        <span className="muted">{t("activeSchedule")}</span>
        <select
          className="pill"
          value={active?.id ?? ""}
          onChange={(e) => {
            const scheduleId = e.target.value;
            startScheduleTransition(async () => {
              try {
                await setActiveSchedule(scheduleId);
                await reload();
              } catch (scheduleError) {
                toast.error(
                  scheduleError instanceof Error
                    ? scheduleError.message
                    : t("error"),
                );
              }
            });
          }}
          disabled={switchingSchedule}
        >
          {data.schedules
            .filter((s) => !s.is_archived)
            .map((s) => (
              <option value={s.id} key={s.id}>
                {s.emoji} {s.name}
              </option>
            ))}
        </select>
      </div>
      {content}
    </>
  );
}
