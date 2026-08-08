"use client";
import { useEffect, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { WorkspaceSkeleton } from "@/components/workspace-skeleton";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { setActiveSchedule } from "@/app/actions/domain";
import { useWorkspace } from "@/features/workspace/use-workspace";
import type { WorkspaceMode } from "@/features/workspace/types";
import { applyPreferences, normalizePreferences } from "@/lib/preferences";

const TodayView = dynamic(() =>
  import("@/features/workspace/task-views").then((module) => module.TodayView),
);
const WeekView = dynamic(() =>
  import("@/features/workspace/task-views").then((module) => module.WeekView),
);
const MonthView = dynamic(() =>
  import("@/features/workspace/planning-views").then(
    (module) => module.MonthView,
  ),
);
const GlobalSearchView = dynamic(() =>
  import("@/features/workspace/planning-views").then(
    (module) => module.GlobalSearchView,
  ),
);
const TasksView = dynamic(() =>
  import("@/features/workspace/task-views").then((module) => module.TasksView),
);
const HistoryView = dynamic(() =>
  import("@/features/workspace/task-views").then(
    (module) => module.HistoryView,
  ),
);
const StatisticsView = dynamic(() =>
  import("@/features/statistics/statistics-view").then(
    (module) => module.StatisticsView,
  ),
);
const EventsView = dynamic(() =>
  import("@/features/workspace/resource-views").then(
    (module) => module.EventsView,
  ),
);
const SchedulesView = dynamic(() =>
  import("@/features/workspace/resource-views").then(
    (module) => module.SchedulesView,
  ),
);
const CategoriesView = dynamic(() =>
  import("@/features/workspace/resource-views").then(
    (module) => module.CategoriesView,
  ),
);
const SettingsView = dynamic(() =>
  import("@/features/workspace/resource-views").then(
    (module) => module.SettingsView,
  ),
);

export function WorkspacePage({ mode }: { mode: WorkspaceMode }) {
  const t = useTranslations("Workspace"),
    { db, data, loading, error, reload } = useWorkspace(mode),
    [starters, setStarters] = useState(true),
    [starting, setStarting] = useState(false),
    [switchingSchedule, startScheduleTransition] = useTransition();
  useEffect(() => {
    if (
      mode === "today" ||
      mode === "week" ||
      mode === "tasks" ||
      mode === "history"
    )
      void import("@/features/workspace/task-views");
    else void import("@/features/workspace/resource-views");
  }, [mode]);
  useEffect(() => {
    if (data?.profile.preferences)
      applyPreferences(normalizePreferences(data.profile.preferences));
  }, [data?.profile.preferences]);

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
    ) : mode === "month" ? (
      <MonthView data={data} />
    ) : mode === "search" ? (
      <GlobalSearchView data={data} />
    ) : mode === "tasks" ? (
      <TasksView data={data} reload={reload} />
    ) : mode === "events" ? (
      <EventsView data={data} reload={reload} />
    ) : mode === "history" ? (
      <HistoryView data={data} />
    ) : mode === "statistics" ? (
      <StatisticsView data={data} />
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
