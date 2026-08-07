"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
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
  return t("modes.cycles");
}

function nextPhaseHint(session: FocusSession, t: ReturnType<typeof useTranslations<"Focus">>) {
  if (session.mode === "stopwatch") return t("activeView.nextStopwatch");
  if (session.mode === "countdown") return t("activeView.nextEnd");
  const completed = countCompletedFocusBlocks(session);
  const plan = planNextPhase(session, completed);
  if (plan.completesSession) return t("activeView.nextEnd");
  if (plan.kind === "focus") return t("activeView.nextFocus", { n: plan.cycleIndex });
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
  const { engine, immersive, setImmersive, hydrateSession } =
    useFocusSessionContext();
  const session = engine.session;
  const clock = engine.snapshot?.clock;
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [distractionOpen, setDistractionOpen] = useState(false);
  const [note, setNote] = useState(() => session?.notes ?? "");
  const [distractionDraft, setDistractionDraft] = useState("");
  const [noteSessionId, setNoteSessionId] = useState(session?.id ?? "");
  const [customExtend, setCustomExtend] = useState("3");
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const phaseLiveId = useId();
  const rootRef = useRef<HTMLElement | null>(null);
  const distractionInputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    if (!immersive) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setImmersive(false);
        onExitImmersive?.();
        exitBrowserFullscreen();
      }
      if (event.key === " " && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        if (session?.status === "paused") void engine.resume();
        else if (session?.status === "running" || session?.status === "on_break")
          void engine.pause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [immersive, session?.status, engine, setImmersive, onExitImmersive]);

  if (!session || !clock || !isLive(session)) return null;

  const progress = Math.round((clock.phase.progress || 0) * 100);
  const cycleProgress =
    session.mode === "cycles" ? getCycleProgress(session) : null;
  const onBreak = session.status === "on_break";
  const title =
    session.title ||
    session.linkSnapshot.taskTitle ||
    t("active.untitled");
  const category = session.linkSnapshot.categoryName;
  const displayTime =
    clock.remainingSec != null
      ? formatFocusDuration(clock.remainingSec)
      : formatFocusDuration(clock.focusElapsedSec);

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
    >
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
            aria-label={
              immersive
                ? t("activeView.exitFocusMode")
                : t("activeView.enterFocusMode")
            }
            onClick={() => void toggleImmersive()}
          >
            {immersive ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
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

      {/* Phase changes only — aria-live polite, content updates on phase key */}
      <p id={phaseLiveId} className="sr-only" aria-live="polite">
        {phaseAnnouncement}
      </p>

      <div className="focus-active-stage">
        <p className="focus-active-phase">{phaseLabel(session.currentPhaseKind, t)}</p>
        <p
          className="focus-active-time"
          aria-hidden="true"
        >
          {displayTime}
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
        <p className="muted focus-next-hint">{nextPhaseHint(session, t)}</p>
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
        <div className="focus-break-panel" role="region" aria-label={t("cycles.breakPanel")}>
          <p>
            <strong>{phaseLabel(session.currentPhaseKind, t)}</strong>
            {" · "}
            {t("cycles.breakNext")}: {nextPhaseHint(session, t)}
          </p>
        </div>
      ) : null}

      <div className="focus-active-controls">
        {waitingManual && session.status === "running" ? (
          <button
            type="button"
            className="primary focus-control-main"
            disabled={engine.pending}
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
            disabled={engine.pending}
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
            disabled={engine.pending}
            onClick={() => void engine.resume()}
          >
            <Play size={20} aria-hidden="true" />
            {t("engine.resume")}
          </button>
        ) : !waitingManual ? (
          <button
            type="button"
            className="primary focus-control-main"
            disabled={engine.pending}
            onClick={() => void engine.pause()}
          >
            <Pause size={20} aria-hidden="true" />
            {t("engine.pause")}
          </button>
        ) : null}

        <button
          type="button"
          className="focus-secondary-action"
          disabled={engine.pending}
          onClick={() => void engine.complete()}
        >
          <Square size={16} aria-hidden="true" />
          {t("engine.complete")}
        </button>

        {onBreak ? (
          <>
            <button
              type="button"
              className="focus-secondary-action"
              disabled={engine.pending}
              onClick={() => void engine.skipBreak()}
            >
              <SkipForward size={16} aria-hidden="true" />
              {t("cycles.startFocusEarly")}
            </button>
            <button
              type="button"
              className="focus-secondary-action"
              disabled={engine.pending}
              onClick={() => void engine.extendBreak(60)}
            >
              <Plus size={16} aria-hidden="true" />
              {t("activeView.extend1")}
            </button>
            <button
              type="button"
              className="focus-secondary-action"
              disabled={engine.pending}
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
                disabled={engine.pending}
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
              disabled={engine.pending}
              onClick={() => void engine.extendBreak(60)}
            >
              <Plus size={16} aria-hidden="true" />
              {t("activeView.add1")}
            </button>
            <button
              type="button"
              className="focus-secondary-action"
              disabled={engine.pending}
              onClick={() => void engine.extendBreak(300)}
            >
              <Plus size={16} aria-hidden="true" />
              {t("activeView.add5")}
            </button>
          </>
        ) : null}
      </div>

      <p className="muted focus-shortcuts">{t("activeView.shortcuts")}</p>

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
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={t("engine.cancelTitle")}
        description={t("engine.cancelDescription")}
        cancelLabel={common("cancel")}
        confirmLabel={t("engine.cancel")}
        variant="danger"
        onConfirm={async () => {
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
        onConfirm={() => discardActive()}
      />
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
