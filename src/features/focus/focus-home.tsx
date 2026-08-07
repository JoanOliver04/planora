"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ListPlus, Play, Timer } from "lucide-react";
import type {
  FocusGoal,
  FocusMode,
  FocusPreset,
  FocusSession,
} from "./types";
import { FocusGoalsPanel } from "./focus-goals-panel";
import { deriveSessionClock, sessionSummary } from "./time";
import { formatFocusDuration } from "./defaults";
import {
  SessionStartDialog,
  type FocusTaskOption,
  type SessionStartDraft,
} from "./session-start-dialog";
import { useFocusSession } from "./use-focus-session";
import {
  useOptionalFocusSessionContext,
} from "./focus-session-context";
import { ActiveSessionView } from "./active-session-view";
import type { UseFocusSessionResult } from "./use-focus-session";
import { SessionCompleteCard } from "./session-complete-card";
import { FocusPresetManager } from "./preset-manager";
import {
  defaultFocusAccountPreferences,
  type FocusAccountPreferences,
} from "./focus-preferences";

export type FocusHomeProps = {
  activeSession: FocusSession | null;
  recentSessions: FocusSession[];
  presets: FocusPreset[];
  goals?: FocusGoal[];
  /** @deprecated use goals */
  goal?: FocusGoal | null;
  weekSessions: FocusSession[];
  timezone: string;
  weekStartsOn: number;
  tasks?: FocusTaskOption[];
  categories?: Array<{ id: string; name: string; emoji: string | null }>;
  accountPreferences?: FocusAccountPreferences;
  /** Prefill from task deep link (e.g. /focus?taskId=…&date=…). */
  initialDraft?: SessionStartDraft | null;
  autoOpenConfigurator?: boolean;
};

function modeLabel(
  mode: FocusMode,
  t: ReturnType<typeof useTranslations<"Focus">>,
) {
  if (mode === "countdown") return t("modes.countdown");
  if (mode === "stopwatch") return t("modes.stopwatch");
  return t("modes.cycles");
}

export function FocusHome({
  activeSession,
  recentSessions,
  presets,
  goals: goalsProp,
  goal = null,
  weekSessions,
  timezone,
  weekStartsOn,
  tasks = [],
  categories = [],
  accountPreferences = defaultFocusAccountPreferences,
  initialDraft = null,
  autoOpenConfigurator = false,
}: FocusHomeProps) {
  const goals = goalsProp ?? (goal ? [goal] : []);
  const t = useTranslations("Focus");
  const [dialogOpen, setDialogOpen] = useState(
    Boolean(autoOpenConfigurator && initialDraft),
  );
  const [dialogKey, setDialogKey] = useState(0);
  const [draft, setDraft] = useState<SessionStartDraft | null>(initialDraft);

  const shared = useOptionalFocusSessionContext();

  // Hydrate the shared runtime with the server-fetched active session.
  useEffect(() => {
    if (shared && activeSession) shared.hydrateSession(activeSession);
  }, [shared, activeSession]);

  useEffect(() => {
    document.documentElement.dataset.focusTimerDisplay =
      accountPreferences.timerDisplay;
  }, [accountPreferences.timerDisplay]);

  // Prefer the app-wide engine so compact bar and home share one timer.
  const localEngine = useFocusSession(shared ? null : activeSession, {
    onRecovered: () => toast.message(t("engine.recovered")),
    onSoftGoal: () => toast.message(t("engine.softGoal")),
    onTerminal: (session) => {
      if (session.status === "completed") toast.success(t("engine.completed"));
    },
  });

  const engine: UseFocusSessionResult = shared?.engine ?? localEngine;
  const liveSession = engine.session ?? activeSession;
  const now = engine.now;
  const hasActive =
    Boolean(liveSession) &&
    (liveSession?.status === "running" ||
      liveSession?.status === "paused" ||
      liveSession?.status === "on_break");

  const weekFocusSec = useMemo(
    () =>
      weekSessions.reduce((total, session) => {
        if (session.status === "completed" || session.status === "cancelled") {
          return total + session.focusSec;
        }
        return total + deriveSessionClock(session, now).focusElapsedSec;
      }, 0),
    [weekSessions, now],
  );

  const hasHistory = recentSessions.length > 0 || hasActive;

  function openConfigurator(nextDraft: SessionStartDraft | null = null) {
    setDraft(nextDraft);
    setDialogKey((value) => value + 1);
    setDialogOpen(true);
  }

  return (
    <section className="focus-home" aria-labelledby="focus-title">
      <header className="topbar focus-home-header">
        <div>
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1 className="title" id="focus-title">
            {t("title")}
          </h1>
          <p className="muted">{t("subtitle")}</p>
        </div>
        {!hasActive ? (
          <button
            type="button"
            className="primary focus-primary-action"
            onClick={() => openConfigurator(null)}
          >
            <Play size={18} aria-hidden="true" />
            {t("actions.startSession")}
          </button>
        ) : null}
      </header>

      {hasActive && shared ? (
        <ActiveSessionView />
      ) : hasActive ? (
        // Fallback when provider is absent (isolated tests).
        <ActiveSessionFallback engine={engine} />
      ) : null}

      {!hasActive && shared?.lastCompleted ? (
        <SessionCompleteCard
          session={shared.lastCompleted}
          onDismiss={() => shared.clearLastCompleted()}
          openReviewByDefault={accountPreferences.askReviewOnEnd}
          weeklyGoalLabel={null}
        />
      ) : null}

      {!hasHistory ? (
        <div className="empty surface focus-empty" role="status">
          <span className="empty-icon" aria-hidden="true">
            <Timer size={28} />
          </span>
          <h2>{t("empty.title")}</h2>
          <p>{t("empty.body")}</p>
          <div className="focus-empty-actions">
            <button
              type="button"
              className="primary"
              onClick={() =>
                openConfigurator({
                  mode: "countdown",
                  focusDurationSec: 25 * 60,
                  quickKey: "quick-25",
                })
              }
            >
              <Play size={18} aria-hidden="true" />
              {t("actions.quickStart")}
            </button>
            <button
              type="button"
              className="focus-secondary-action"
              onClick={() => openConfigurator(null)}
            >
              <ListPlus size={18} aria-hidden="true" />
              {t("actions.createPreset")}
            </button>
          </div>
        </div>
      ) : null}

      {!hasActive ? (
        <FocusPresetManager
          presets={presets}
          recentSessions={recentSessions}
          categories={categories}
          onStartPreset={(draft) => openConfigurator(draft)}
        />
      ) : null}

      {!hasActive && accountPreferences.showWeeklyGoal ? (
        <FocusGoalsPanel
          goals={goals}
          sessions={weekSessions}
          timezone={timezone}
          weekStartsOn={weekStartsOn}
          categories={categories}
          presets={presets.map((preset) => ({
            id: preset.id,
            name: preset.name,
            emoji: preset.emoji,
          }))}
        />
      ) : null}

      {hasHistory ? (
        <section
          className="surface focus-week-summary"
          aria-labelledby="focus-week-title"
        >
          <h2 id="focus-week-title">{t("weekSummary.title")}</h2>
          <p>
            {t("weekSummary.body", {
              time: formatFocusDuration(weekFocusSec, "compact"),
              sessions: weekSessions.length,
            })}
          </p>
        </section>
      ) : null}

      {recentSessions.length > 0 ? (
        <section className="focus-section" aria-labelledby="focus-recent-title">
          <div className="focus-section-head">
            <h2 id="focus-recent-title">{t("recent.title")}</h2>
          </div>
          <ul className="focus-recent-list">
            {recentSessions.map((session) => {
              const summary = sessionSummary(session);
              return (
                <li key={session.id} className="surface focus-recent-item">
                  <div>
                    <strong>
                      {session.title ||
                        session.linkSnapshot.taskTitle ||
                        t("active.untitled")}
                    </strong>
                    <small className="muted">
                      {modeLabel(session.mode, t)}
                      {" · "}
                      {formatFocusDuration(summary.focusSec, "compact")}
                      {" · "}
                      {session.status === "completed"
                        ? t("status.completed")
                        : t("status.cancelled")}
                    </small>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <SessionStartDialog
        key={dialogKey}
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) void shared?.reloadActiveSession();
        }}
        draft={draft}
        activeSession={hasActive ? liveSession : null}
        presets={presets}
        tasks={tasks}
        accountPreferences={accountPreferences}
        askIntentionOnStart={accountPreferences.askIntentionOnStart}
        defaultOccurrenceDate={
          // Prefer draft occurrence, else profile-local today for new task links.
          draft?.occurrenceDate ??
          new Intl.DateTimeFormat("en-CA", {
            timeZone: timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date())
        }
        onStarted={() => {
          void shared?.reloadActiveSession();
        }}
      />
    </section>
  );
}

/** Minimal fallback for tests without FocusSessionProvider. */
function ActiveSessionFallback({
  engine,
}: {
  engine: UseFocusSessionResult;
}) {
  const t = useTranslations("Focus");
  const session = engine.session;
  const clock = engine.snapshot?.clock;
  if (!session || !clock) return null;
  return (
    <article className="surface focus-active-card">
      <p className="eyebrow">{t("active.badge")}</p>
      <h2>
        {session.title ||
          session.linkSnapshot.taskTitle ||
          t("active.untitled")}
      </h2>
      <div className="focus-active-clock">
        <strong>
          {clock.remainingSec != null
            ? formatFocusDuration(clock.remainingSec)
            : formatFocusDuration(clock.focusElapsedSec)}
        </strong>
      </div>
      <div className="focus-active-actions">
        <button
          type="button"
          className="primary"
          disabled={engine.pending}
          onClick={() =>
            void (session.status === "paused" ? engine.resume() : engine.pause())
          }
        >
          {session.status === "paused" ? t("engine.resume") : t("engine.pause")}
        </button>
        <button
          type="button"
          className="focus-secondary-action"
          disabled={engine.pending}
          onClick={() => void engine.complete()}
        >
          {t("engine.complete")}
        </button>
      </div>
    </article>
  );
}
