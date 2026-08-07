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
} from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatFocusDuration } from "./defaults";
import { planNextPhase, countCompletedFocusBlocks } from "./cycles";
import { updateFocusSessionMetadataAction } from "./actions";
import { useFocusSessionContext } from "./focus-session-context";
import type { FocusPhaseKind, FocusSession } from "./types";
import { toast } from "sonner";

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
  const { engine, immersive, setImmersive } = useFocusSessionContext();
  const session = engine.session;
  const clock = engine.snapshot?.clock;
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState(() => session?.notes ?? "");
  const [noteSessionId, setNoteSessionId] = useState(session?.id ?? "");
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const phaseLiveId = useId();
  const rootRef = useRef<HTMLElement | null>(null);

  // Keep the draft note aligned when the active session identity changes.
  if (session && session.id !== noteSessionId) {
    setNoteSessionId(session.id);
    setNote(session.notes ?? "");
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
    toast.success(t("activeView.noteSaved"));
    setNoteOpen(false);
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
                  className="is-danger"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmCancel(true);
                  }}
                >
                  {t("engine.cancel")}
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
        {waitingManual ? (
          <p className="focus-waiting" role="status">
            {t("activeView.phaseEnded")}
          </p>
        ) : null}
      </div>

      <div className="focus-active-controls">
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
        ) : (
          <button
            type="button"
            className="primary focus-control-main"
            disabled={engine.pending}
            onClick={() => void engine.pause()}
          >
            <Pause size={20} aria-hidden="true" />
            {t("engine.pause")}
          </button>
        )}

        <button
          type="button"
          className="focus-secondary-action"
          disabled={engine.pending}
          onClick={() => void engine.complete()}
        >
          <Square size={16} aria-hidden="true" />
          {t("engine.complete")}
        </button>

        {session.status === "on_break" ? (
          <>
            <button
              type="button"
              className="focus-secondary-action"
              disabled={engine.pending}
              onClick={() => void engine.skipBreak()}
            >
              <SkipForward size={16} aria-hidden="true" />
              {t("engine.skipBreak")}
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
          </>
        ) : null}

        {session.status === "running" &&
        session.mode !== "stopwatch" &&
        clock.phase.plannedSec != null ? (
          <button
            type="button"
            className="focus-secondary-action"
            disabled={engine.pending}
            onClick={() => void engine.extendBreak(60)}
          >
            <Plus size={16} aria-hidden="true" />
            {t("activeView.add1")}
          </button>
        ) : null}

        {session.status === "running" &&
        session.mode !== "stopwatch" &&
        clock.phase.plannedSec != null ? (
          <button
            type="button"
            className="focus-secondary-action"
            disabled={engine.pending}
            onClick={() => void engine.extendBreak(300)}
          >
            <Plus size={16} aria-hidden="true" />
            {t("activeView.add5")}
          </button>
        ) : null}
      </div>

      <p className="muted focus-shortcuts">{t("activeView.shortcuts")}</p>

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
