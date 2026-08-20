"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslations } from "next-intl";
import {
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  SkipForward,
  Square,
  StickyNote,
  Inbox,
  Trash2,
  Keyboard,
  Volume2,
} from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatFocusDuration } from "./defaults";
import {
  planNextPhase,
  countCompletedFocusBlocks,
  getCycleProgress,
} from "./cycles";
import {
  discardFocusSessionAction,
  updateFocusSessionMetadataAction,
} from "./actions";
import { useFocusSessionContext } from "./focus-session-context";
import type { FocusPhaseKind, FocusSession } from "./types";
import { toast } from "sonner";
import { addDistraction } from "./focus-review";
import {
  FOCUS_MAX_DISTRACTION_LENGTH,
  FOCUS_MAX_DISTRACTIONS,
} from "./validation";
import {
  defaultFocusAccountPreferences,
  defaultFocusDevicePreferences,
  loadFocusDevicePreferences,
  subscribeFocusDevicePreferences,
} from "./focus-preferences";
import {
  calculatePlanTotals,
  currentSegment,
  hasStructuredPlan,
  nextSegment,
} from "./session-plan";
import {
  FOCUS_SHORTCUT_LIST,
  isDesktopPointer,
  isTypingTarget,
  resolveFocusShortcut,
} from "./focus-keyboard";

function phaseLabel(
  kind: FocusPhaseKind | null,
  t: ReturnType<typeof useTranslations<"Focus">>,
) {
  if (kind === "focus") return t("phases.focus");
  if (kind === "short_break") return t("phases.shortBreak");
  if (kind === "long_break") return t("phases.longBreak");
  if (kind === "pause") return t("phases.pause");
  return t("phases.unknown");
}

function modeLabel(
  mode: FocusSession["mode"],
  t: ReturnType<typeof useTranslations<"Focus">>,
) {
  if (mode === "countdown") return t("modes.countdown");
  if (mode === "stopwatch") return t("modes.stopwatch");
  if (mode === "cycles") return t("modes.cycles");
  return t("modes.structured_plan");
}

function nextPhaseHint(
  session: FocusSession,
  t: ReturnType<typeof useTranslations<"Focus">>,
) {
  if (session.mode === "stopwatch") return t("activeView.nextStopwatch");
  if (session.mode === "countdown") return t("activeView.nextEnd");
  const completed = countCompletedFocusBlocks(session);
  const plan = planNextPhase(session, completed);
  if (plan.completesSession) return t("activeView.nextEnd");
  if (plan.kind === "focus")
    return t("activeView.nextFocus", { n: plan.cycleIndex });
  if (plan.kind === "long_break") return t("activeView.nextLongBreak");
  return t("activeView.nextShortBreak");
}

export function ActiveSessionView({
  onExitImmersive,
}: {
  onExitImmersive?: () => void;
} = {}) {
  const t = useTranslations("Focus");
  const common = useTranslations("Common");
  const {
    engine,
    immersive,
    setImmersive,
    hydrateSession,
    controlMode,
    setTakeoverDialogOpen,
  } = useFocusSessionContext();
  const session = engine.session;
  const clock = engine.snapshot?.clock;
  const readOnly = controlMode === "follower";
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [distractionOpen, setDistractionOpen] = useState(false);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const [note, setNote] = useState(() => session?.notes ?? "");
  const [distractionDraft, setDistractionDraft] = useState("");
  const [noteSessionId, setNoteSessionId] = useState(session?.id ?? "");
  const [customExtend, setCustomExtend] = useState("3");
  const [statusAnnouncement, setStatusAnnouncement] = useState("");
  const [statusTrackKey, setStatusTrackKey] = useState<string | null>(null);
  const [timeAnnouncement, setTimeAnnouncement] = useState("");
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const device = useSyncExternalStore(
    subscribeFocusDevicePreferences,
    loadFocusDevicePreferences,
    () => defaultFocusDevicePreferences,
  );
  const phaseLiveId = useId();
  const statusLiveId = useId();
  const timeLiveId = useId();
  const rootRef = useRef<HTMLElement | null>(null);
  const distractionInputRef = useRef<HTMLInputElement | null>(null);
  const noteTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Keep the draft note aligned when the active session identity changes.
  if (session && session.id !== noteSessionId) {
    setNoteSessionId(session.id);
    setNote(session.notes ?? "");
    setDistractionDraft("");
  }

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Announce phase changes only (not every tick).
  const phaseAnnouncement = useMemo(() => {
    if (!session) return "";
    return `${phaseLabel(session.currentPhaseKind, t)}. ${
      session.mode === "cycles"
        ? t("active.cycle", { n: session.currentCycle })
        : modeLabel(session.mode, t)
    }`;
  }, [session, t]);

  // Announce pause / resume / terminal during render adjust (not every second).
  if (session) {
    const key = `${session.id}:${session.status}`;
    if (statusTrackKey !== key) {
      const previous = statusTrackKey;
      setStatusTrackKey(key);
      if (previous != null) {
        if (session.status === "paused")
          setStatusAnnouncement(t("a11y.paused"));
        else if (session.status === "running")
          setStatusAnnouncement(t("a11y.resumed"));
        else if (session.status === "on_break")
          setStatusAnnouncement(t("a11y.onBreak"));
        else if (session.status === "completed")
          setStatusAnnouncement(t("a11y.completed"));
        else if (session.status === "cancelled")
          setStatusAnnouncement(t("a11y.cancelled"));
      }
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const hasOverlay =
        menuOpen ||
        noteOpen ||
        distractionOpen ||
        shortcutsHelpOpen ||
        confirmCancel ||
        confirmDiscard ||
        confirmComplete;

      const action = resolveFocusShortcut(event, {
        enabled: device.keyboardShortcutsEnabled,
        desktop: isDesktopPointer(),
        typingTarget: isTypingTarget(event.target),
        hasChordModifier: event.ctrlKey || event.metaKey || event.altKey,
        hasOverlay,
        immersive,
        readOnly,
      });
      if (!action) return;

      event.preventDefault();

      if (action === "closeOverlay") {
        if (shortcutsHelpOpen) {
          setShortcutsHelpOpen(false);
          return;
        }
        if (noteOpen) {
          setNoteOpen(false);
          return;
        }
        if (distractionOpen) {
          setDistractionOpen(false);
          return;
        }
        if (menuOpen) {
          setMenuOpen(false);
          return;
        }
        if (confirmComplete) {
          setConfirmComplete(false);
          return;
        }
        if (confirmCancel) {
          setConfirmCancel(false);
          return;
        }
        if (confirmDiscard) {
          setConfirmDiscard(false);
          return;
        }
        if (immersive) {
          setImmersive(false);
          onExitImmersive?.();
          exitBrowserFullscreen();
        }
        return;
      }

      if (action === "pauseResume") {
        if (session?.status === "paused") void engine.resume();
        else if (
          session?.status === "running" ||
          session?.status === "on_break"
        )
          void engine.pause();
        return;
      }
      if (action === "toggleImmersive") {
        void toggleImmersive();
        return;
      }
      if (action === "openNote") {
        setMenuOpen(false);
        setNoteOpen(true);
        window.setTimeout(() => noteTextareaRef.current?.focus(), 0);
        return;
      }
      if (action === "openDistraction") {
        setMenuOpen(false);
        setDistractionOpen(true);
        window.setTimeout(() => distractionInputRef.current?.focus(), 0);
        return;
      }
      if (action === "openShortcutsHelp") {
        setShortcutsHelpOpen(true);
        return;
      }
      if (action === "confirmComplete") {
        setConfirmComplete(true);
        return;
      }
      if (action === "announceTime") {
        announceTimeNow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // announceTimeNow / toggleImmersive read latest session via closure each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyboard handler rebinds on UI chrome state
  }, [
    device.keyboardShortcutsEnabled,
    immersive,
    session?.status,
    engine,
    setImmersive,
    onExitImmersive,
    readOnly,
    menuOpen,
    noteOpen,
    distractionOpen,
    shortcutsHelpOpen,
    confirmCancel,
    confirmDiscard,
    confirmComplete,
    session,
    clock,
    t,
  ]);

  function announceTimeNow() {
    if (!session || !clock) return;
    const value =
      clock.remainingSec != null
        ? formatFocusDuration(clock.remainingSec, "compact")
        : formatFocusDuration(clock.focusElapsedSec, "compact");
    const label =
      clock.remainingSec != null
        ? t("a11y.timeRemaining", { time: value })
        : t("a11y.timeElapsed", { time: value });
    setTimeAnnouncement(label);
  }

  if (!session || !clock || !isLive(session)) return null;

  const progress = Math.round((clock.phase.progress || 0) * 100);
  const cycleProgress =
    session.mode === "cycles" && !hasStructuredPlan(session)
      ? getCycleProgress(session)
      : null;
  const planActive = hasStructuredPlan(session);
  const planCurrent = planActive ? currentSegment(session) : null;
  const planNext = planActive ? nextSegment(session) : null;
  const onBreak = session.status === "on_break";
  const title =
    session.title || session.linkSnapshot.taskTitle || t("active.untitled");
  const category = session.linkSnapshot.categoryName;
  const timerDisplay =
    typeof window === "undefined"
      ? defaultFocusAccountPreferences.timerDisplay
      : (() => {
          try {
            const raw = window.localStorage.getItem(
              "planora-focus-timer-display",
            );
            // Prefer account prefs passed via data attribute set by FocusHome when available.
            const fromDom = document.documentElement.dataset.focusTimerDisplay;
            if (fromDom === "compact" || fromDom === "large") return fromDom;
            if (raw === "compact" || raw === "large") return raw;
          } catch {
            // ignore
          }
          return defaultFocusAccountPreferences.timerDisplay;
        })();
  const displayTime =
    clock.remainingSec != null
      ? formatFocusDuration(
          clock.remainingSec,
          timerDisplay === "compact" ? "compact" : "clock",
        )
      : formatFocusDuration(
          clock.focusElapsedSec,
          timerDisplay === "compact" ? "compact" : "clock",
        );

  async function toggleImmersive() {
    if (immersive) {
      setImmersive(false);
      onExitImmersive?.();
      exitBrowserFullscreen();
      return;
    }
    setImmersive(true);
    await requestBrowserFullscreen(rootRef.current);
  }

  async function saveNote() {
    if (!session) return;
    const result = await updateFocusSessionMetadataAction({
      sessionId: session.id,
      expectedRevision: session.revision,
      notes: note.trim() || null,
    });
    if (!result.ok) {
      toast.error(t("engine.persistError"));
      return;
    }
    // Keep the live engine revision in sync so later pause/complete do not conflict.
    hydrateSession({
      ...session,
      notes: note.trim() || null,
      revision: result.data.revision,
      updatedAt: result.data.updatedAt,
    });
    toast.success(t("activeView.noteSaved"));
    setNoteOpen(false);
  }

  async function parkDistraction() {
    if (!session) return;
    const next = addDistraction(session.distractions, distractionDraft);
    if (!next.ok) {
      toast.error(
        next.reason === "limit"
          ? t("review.distractionLimit")
          : t("review.distractionEmpty"),
      );
      return;
    }
    const result = await updateFocusSessionMetadataAction({
      sessionId: session.id,
      expectedRevision: session.revision,
      distractions: next.distractions,
    });
    if (!result.ok) {
      toast.error(t("engine.persistError"));
      return;
    }
    hydrateSession({
      ...session,
      distractions: next.distractions,
      revision: result.data.revision,
      updatedAt: result.data.updatedAt,
    });
    setDistractionDraft("");
    setDistractionOpen(false);
    toast.success(t("review.distractionParked"));
  }

  async function discardActive() {
    if (!session) return false;
    const result = await discardFocusSessionAction({
      sessionId: session.id,
      expectedRevision: session.revision,
    });
    if (!result.ok) {
      toast.error(t("engine.persistError"));
      return false;
    }
    toast.success(t("review.discarded"));
    hydrateSession(null);
    setImmersive(false);
    return true;
  }

  const waitingManual =
    engine.snapshot?.phaseComplete &&
    !engine.snapshot.shouldAutoAdvance &&
    session.status !== "paused";

  return (
    <section
      ref={rootRef}
      className={`focus-active-view surface ${immersive ? "is-immersive" : ""}`}
      aria-labelledby="focus-active-heading"
      data-pending={engine.pending || undefined}
      data-offline={!online || undefined}
      data-control={controlMode}
    >
      {readOnly ? (
        <div className="focus-sync-banner" role="status">
          <div>
            <strong>{t("sync.followerTitle")}</strong>
            <p className="muted">{t("sync.followerBody")}</p>
          </div>
          <button
            type="button"
            className="primary"
            disabled={engine.pending}
            onClick={() => setTakeoverDialogOpen(true)}
          >
            {t("sync.continueHere")}
          </button>
        </div>
      ) : null}
      <div className="focus-active-view-top">
        <div>
          <p className="eyebrow">{t("active.badge")}</p>
          <h2 id="focus-active-heading" className="focus-active-title">
            {title}
          </h2>
          <p className="muted focus-active-meta">
            {phaseLabel(session.currentPhaseKind, t)}
            {" · "}
            {modeLabel(session.mode, t)}
            {session.mode === "cycles"
              ? ` · ${t("active.cycle", { n: session.currentCycle })}`
              : null}
            {category ? ` · ${category}` : null}
          </p>
        </div>
        <div className="focus-active-view-tools">
          {!online ? (
            <span className="focus-status-chip" role="status">
              {t("activeView.offline")}
            </span>
          ) : null}
          {!online ? (
            <span className="focus-status-chip" role="status">
              {t("offline.pending")}
            </span>
          ) : null}
          {engine.pending ? (
            <span className="focus-status-chip" role="status">
              {t("activeView.syncing")}
            </span>
          ) : null}
          {engine.recoveredNotice ? (
            <span className="focus-status-chip is-recover" role="status">
              {t("engine.recovered")}
            </span>
          ) : null}
          <button
            type="button"
            className="icon-button"
            aria-label={t("a11y.announceTime")}
            title={t("a11y.announceTime")}
            onClick={() => announceTimeNow()}
          >
            <Volume2 size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={t("a11y.shortcutsHelp")}
            title={t("a11y.shortcutsHelp")}
            onClick={() => setShortcutsHelpOpen(true)}
          >
            <Keyboard size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={
              immersive
                ? t("activeView.exitFocusMode")
                : t("activeView.enterFocusMode")
            }
            onClick={() => void toggleImmersive()}
          >
            {immersive ? (
              <Minimize2 size={18} aria-hidden="true" />
            ) : (
              <Maximize2 size={18} aria-hidden="true" />
            )}
          </button>
          <div className="focus-more-menu">
            <button
              type="button"
              className="icon-button"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label={t("activeView.more")}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <MoreHorizontal size={18} />
            </button>
            {menuOpen ? (
              <div className="focus-more-panel surface" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setNoteOpen(true);
                  }}
                >
                  <StickyNote size={16} aria-hidden="true" />
                  {t("activeView.addNote")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setDistractionOpen(true);
                    window.setTimeout(
                      () => distractionInputRef.current?.focus(),
                      0,
                    );
                  }}
                >
                  <Inbox size={16} aria-hidden="true" />
                  {t("review.parkDistraction")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="is-danger"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmCancel(true);
                  }}
                >
                  {t("engine.cancel")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="is-danger"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmDiscard(true);
                  }}
                >
                  <Trash2 size={16} aria-hidden="true" />
                  {t("review.discard")}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Phase / status / on-demand time — never each tick */}
      <p id={phaseLiveId} className="sr-only" aria-live="polite">
        {phaseAnnouncement}
      </p>
      <p id={statusLiveId} className="sr-only" aria-live="polite">
        {statusAnnouncement}
      </p>
      <p id={timeLiveId} className="sr-only" aria-live="assertive">
        {timeAnnouncement}
      </p>

      <div className="focus-active-stage">
        <p className="focus-active-phase">
          {phaseLabel(session.currentPhaseKind, t)}
        </p>
        <p
          className="focus-active-time"
          data-size={timerDisplay}
          aria-hidden="true"
        >
          {displayTime}
        </p>
        <p className="sr-only">
          {clock.remainingSec != null
            ? t("a11y.timeRemaining", {
                time: formatFocusDuration(clock.remainingSec, "compact"),
              })
            : t("a11y.timeElapsed", {
                time: formatFocusDuration(clock.focusElapsedSec, "compact"),
              })}
        </p>
        <p className="muted">
          {clock.remainingSec != null
            ? t("active.remaining")
            : t("active.elapsed")}
        </p>
        <div
          className="focus-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-label={t("activeView.phaseProgress")}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
        {planCurrent ? (
          <div className="focus-plan-live" role="status">
            <p className="focus-plan-live-current">
              <strong>
                {planCurrent.emoji ? `${planCurrent.emoji} ` : ""}
                {planCurrent.name}
              </strong>
              <span className="muted">
                {" · "}
                {t("plan.blockOf", {
                  current: session.currentCycle,
                  total: session.config.segments.length,
                })}
              </span>
            </p>
            {planCurrent.description ? (
              <p className="muted">{planCurrent.description}</p>
            ) : null}
            <p className="muted">
              {(() => {
                const totals = calculatePlanTotals(session.config.segments);
                return t("plan.totals", {
                  focus: formatFocusDuration(totals.focusSec, "compact"),
                  rest: formatFocusDuration(totals.breakSec, "compact"),
                  total: totals.hasOpenFocus
                    ? t("plan.indeterminate")
                    : formatFocusDuration(totals.totalSec, "compact"),
                });
              })()}
            </p>
            <p className="muted">
              {t("plan.actualTotal", {
                time: formatFocusDuration(
                  clock.focusElapsedSec +
                    clock.breakElapsedSec +
                    clock.pausedElapsedSec,
                  "compact",
                ),
              })}
            </p>
            <div
              className="focus-progress"
              role="progressbar"
              aria-label={t("plan.progress")}
              aria-valuemin={0}
              aria-valuemax={session.config.segments.length}
              aria-valuenow={Math.max(0, session.currentCycle - 1)}
            >
              <span
                style={{
                  width: `${Math.max(0, ((session.currentCycle - 1) / session.config.segments.length) * 100)}%`,
                }}
              />
            </div>
            {planNext ? (
              <p className="muted">
                {t("plan.nextBlock")}:{" "}
                {planNext.emoji ? `${planNext.emoji} ` : ""}
                {planNext.name}
              </p>
            ) : (
              <p className="muted">{t("plan.lastBlock")}</p>
            )}
          </div>
        ) : (
          <p className="muted focus-next-hint">{nextPhaseHint(session, t)}</p>
        )}
        {cycleProgress ? (
          <p className="muted focus-cycle-progress">
            {cycleProgress.indefinite
              ? t("cycles.progressIndefinite", {
                  n: cycleProgress.completedFocusBlocks,
                })
              : t("cycles.progress", {
                  done: cycleProgress.completedFocusBlocks,
                  total: cycleProgress.targetCycles ?? 0,
                })}
          </p>
        ) : null}
        {waitingManual ? (
          <p className="focus-waiting" role="status">
            {onBreak
              ? t("cycles.breakEndedManual")
              : t("cycles.focusEndedManual")}
          </p>
        ) : null}
      </div>

      {onBreak ? (
        <div
          className="focus-break-panel"
          role="region"
          aria-label={t("cycles.breakPanel")}
        >
          <p>
            <strong>{phaseLabel(session.currentPhaseKind, t)}</strong>
            {" · "}
            {t("cycles.breakNext")}: {nextPhaseHint(session, t)}
          </p>
        </div>
      ) : null}

      <fieldset
        className="focus-active-controls"
        disabled={engine.pending || readOnly}
      >
        {waitingManual && session.status === "running" ? (
          <button
            type="button"
            className="primary focus-control-main"
            onClick={() => void engine.finishPhase()}
          >
            <Play size={20} aria-hidden="true" />
            {t("cycles.startBreak")}
          </button>
        ) : null}

        {waitingManual && onBreak ? (
          <button
            type="button"
            className="primary focus-control-main"
            onClick={() => void engine.finishPhase()}
          >
            <Play size={20} aria-hidden="true" />
            {t("cycles.startFocusEarly")}
          </button>
        ) : null}

        {session.status === "paused" ? (
          <button
            type="button"
            className="primary focus-control-main"
            onClick={() => void engine.resume()}
          >
            <Play size={20} aria-hidden="true" />
            {t("engine.resume")}
          </button>
        ) : !waitingManual ? (
          <button
            type="button"
            className="primary focus-control-main"
            onClick={() => void engine.pause()}
          >
            <Pause size={20} aria-hidden="true" />
            {t("engine.pause")}
          </button>
        ) : null}

        {planActive ? (
          <>
            <button
              type="button"
              className="focus-secondary-action"
              onClick={() => void engine.finishPhase()}
            >
              <SkipForward size={16} aria-hidden="true" />
              {t("plan.advance")}
            </button>
            <button
              type="button"
              className="focus-secondary-action"
              onClick={() => void engine.skipSegment()}
            >
              <SkipForward size={16} aria-hidden="true" />
              {t("plan.skip")}
            </button>
          </>
        ) : null}

        <button
          type="button"
          className="focus-secondary-action"
          onClick={() => void engine.complete()}
        >
          <Square size={16} aria-hidden="true" />
          {t("engine.complete")}
        </button>

        {onBreak && !planActive ? (
          <>
            <button
              type="button"
              className="focus-secondary-action"
              onClick={() => void engine.skipBreak()}
            >
              <SkipForward size={16} aria-hidden="true" />
              {t("cycles.startFocusEarly")}
            </button>
            <button
              type="button"
              className="focus-secondary-action"
              onClick={() => void engine.extendBreak(60)}
            >
              <Plus size={16} aria-hidden="true" />
              {t("activeView.extend1")}
            </button>
            <button
              type="button"
              className="focus-secondary-action"
              onClick={() => void engine.extendBreak(300)}
            >
              <Plus size={16} aria-hidden="true" />
              {t("activeView.extend5")}
            </button>
            <label className="focus-custom-extend">
              <span className="sr-only">{t("cycles.customExtend")}</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={60}
                value={customExtend}
                onChange={(event) => setCustomExtend(event.target.value)}
                aria-label={t("cycles.customExtend")}
              />
              <button
                type="button"
                className="focus-secondary-action"
                onClick={() => {
                  const minutes = Number(customExtend);
                  if (!Number.isFinite(minutes) || minutes < 1) return;
                  void engine.extendBreak(Math.round(minutes * 60));
                }}
              >
                {t("cycles.applyExtend")}
              </button>
            </label>
          </>
        ) : null}

        {session.status === "running" &&
        session.mode !== "stopwatch" &&
        clock.phase.plannedSec != null ? (
          <>
            <button
              type="button"
              className="focus-secondary-action"
              onClick={() => void engine.extendBreak(60)}
            >
              <Plus size={16} aria-hidden="true" />
              {t("activeView.add1")}
            </button>
            <button
              type="button"
              className="focus-secondary-action"
              onClick={() => void engine.extendBreak(300)}
            >
              <Plus size={16} aria-hidden="true" />
              {t("activeView.add5")}
            </button>
          </>
        ) : null}
      </fieldset>

      <p className="muted focus-shortcuts">
        {device.keyboardShortcutsEnabled
          ? t("activeView.shortcuts")
          : t("a11y.shortcutsDisabled")}{" "}
        <button
          type="button"
          className="link-button"
          onClick={() => setShortcutsHelpOpen(true)}
        >
          {t("a11y.shortcutsHelp")}
        </button>
      </p>

      {session.distractions.length > 0 ? (
        <p className="muted focus-distraction-count" role="status">
          {t("review.distractionCount", { count: session.distractions.length })}
        </p>
      ) : null}

      {noteOpen ? (
        <div className="focus-note-panel surface">
          <label>
            {t("activeView.noteLabel")}
            <textarea
              ref={noteTextareaRef}
              value={note}
              maxLength={4000}
              rows={3}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <div className="dialog-actions">
            <button
              type="button"
              className="pill"
              onClick={() => setNoteOpen(false)}
            >
              {common("cancel")}
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => void saveNote()}
            >
              {common("save")}
            </button>
          </div>
        </div>
      ) : null}

      {distractionOpen ? (
        <div className="focus-note-panel surface">
          <label>
            {t("review.parkDistraction")}
            <input
              ref={distractionInputRef}
              type="text"
              value={distractionDraft}
              maxLength={FOCUS_MAX_DISTRACTION_LENGTH}
              placeholder={t("review.parkPlaceholder")}
              onChange={(event) => setDistractionDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void parkDistraction();
                }
              }}
            />
          </label>
          <p className="muted">
            {t("review.parkHint", {
              remaining: Math.max(
                0,
                FOCUS_MAX_DISTRACTIONS - session.distractions.length,
              ),
            })}
          </p>
          <div className="dialog-actions">
            <button
              type="button"
              className="pill"
              onClick={() => setDistractionOpen(false)}
            >
              {common("cancel")}
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => void parkDistraction()}
            >
              {t("review.parkAction")}
            </button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmComplete}
        onOpenChange={setConfirmComplete}
        title={t("a11y.completeTitle")}
        description={t("a11y.completeDescription")}
        cancelLabel={common("cancel")}
        confirmLabel={t("engine.complete")}
        onConfirm={async () => {
          if (readOnly) return false;
          await engine.complete();
          setImmersive(false);
          return true;
        }}
      />

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={t("engine.cancelTitle")}
        description={t("engine.cancelDescription")}
        cancelLabel={common("cancel")}
        confirmLabel={t("engine.cancel")}
        variant="danger"
        onConfirm={async () => {
          if (readOnly) return false;
          await engine.cancel();
          setImmersive(false);
          return true;
        }}
      />

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title={t("review.discardTitle")}
        description={t("review.discardDescription")}
        cancelLabel={common("cancel")}
        confirmLabel={t("review.discardConfirm")}
        variant="danger"
        onConfirm={() => (readOnly ? false : discardActive())}
      />

      {shortcutsHelpOpen ? (
        <div
          className="focus-shortcuts-help surface"
          role="dialog"
          aria-modal="true"
          aria-labelledby="focus-shortcuts-title"
        >
          <h3 id="focus-shortcuts-title">{t("a11y.shortcutsTitle")}</h3>
          <p className="muted">{t("a11y.shortcutsIntro")}</p>
          <ul className="focus-shortcuts-list">
            {FOCUS_SHORTCUT_LIST.map((item) => (
              <li key={item.action}>
                <kbd>{item.keys}</kbd>
                <span>{t(`a11y.actions.${item.action}`)}</span>
              </li>
            ))}
          </ul>
          <p className="muted">{t("a11y.shortcutsDisableHint")}</p>
          <div className="dialog-actions">
            <button
              type="button"
              className="primary"
              onClick={() => setShortcutsHelpOpen(false)}
            >
              {common("close")}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function isLive(session: FocusSession) {
  return (
    session.status === "running" ||
    session.status === "paused" ||
    session.status === "on_break"
  );
}

async function requestBrowserFullscreen(node: HTMLElement | null) {
  if (!node) return;
  const el = node as HTMLElement & {
    requestFullscreen?: () => Promise<void>;
    webkitRequestFullscreen?: () => void;
  };
  try {
    if (el.requestFullscreen) await el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } catch {
    // Progressive enhancement — immersive CSS still applies.
  }
}

function exitBrowserFullscreen() {
  const doc = document as Document & {
    webkitExitFullscreen?: () => void;
  };
  try {
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
  } catch {
    // ignore
  }
}
