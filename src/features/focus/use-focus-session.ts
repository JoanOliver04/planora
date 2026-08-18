"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { transitionFocusSessionAction } from "./actions";
import {
  autoAdvanceAction,
  createFocusActionGate,
  evaluateFocusEngine,
  prepareFocusSessionOnLoad,
  type FocusEngineSnapshot,
} from "./engine";
import { isActiveStatus } from "./time";
import type { FocusSession } from "./types";
import { applyFocusAction, type FocusDomainAction } from "./state-machine";
import { loadFocusDevicePreferences } from "./focus-preferences";
import {
  cancelFocusPhaseAlert,
  clearFocusAppBadge,
  deliverFocusPhaseAlert,
  scheduleFocusPhaseAlert,
} from "./focus-phase-alerts";
import {
  releaseFocusWakeLock,
  reacquireFocusWakeLockIfNeeded,
  syncFocusWakeLock,
} from "./focus-wake-lock";
import { cacheFocusSession, enqueueFocusTransition } from "./focus-offline";
import type { FocusTransitionInput } from "./validation";

export type UseFocusSessionOptions = {
  onRecovered?: (session: FocusSession) => void;
  onTerminal?: (session: FocusSession) => void;
  onSoftGoal?: (session: FocusSession) => void;
  /** Fired after a successful server write (for multi-tab broadcast). */
  onSessionCommitted?: (
    session: FocusSession,
    action: FocusDomainAction["type"],
  ) => void;
  /** Fired when optimistic revision loses a race. */
  onRevisionConflict?: () => void;
  tickMs?: number;
  /** Locale for scheduled Focus alerts (`es` | `en`). */
  locale?: string;
  /**
   * When true, block user-driven writes (follower tab/device).
   * Auto-recover / auto-advance still allowed so the timer stays honest.
   */
  readOnly?: boolean;
};

export type UseFocusSessionResult = {
  session: FocusSession | null;
  snapshot: FocusEngineSnapshot | null;
  now: number;
  pending: boolean;
  recoveredNotice: boolean;
  clearRecoveredNotice: () => void;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  complete: () => Promise<void>;
  cancel: () => Promise<void>;
  finishPhase: () => Promise<void>;
  skipBreak: () => Promise<void>;
  skipSegment: () => Promise<void>;
  extendBreak: (extraSec: number) => Promise<void>;
  recover: () => Promise<void>;
  takeover: () => Promise<void>;
  refreshNow: () => void;
};

function serverKey(session: FocusSession | null) {
  if (!session) return "none";
  return `${session.id}:${session.revision}:${session.status}:${session.endedAt ?? ""}`;
}

/**
 * Active session runtime engine.
 * Truth is timestamps + intervals; setInterval only refreshes `now` for display.
 */
export function useFocusSession(
  initial: FocusSession | null,
  options: UseFocusSessionOptions = {},
): UseFocusSessionResult {
  const t = useTranslations("Focus");
  const router = useRouter();
  const tickMs = options.tickMs ?? 1000;

  const incomingKey = serverKey(initial);
  const [session, setSession] = useState<FocusSession | null>(initial);
  const [syncedKey, setSyncedKey] = useState(incomingKey);
  if (incomingKey !== syncedKey) {
    setSyncedKey(incomingKey);
    setSession(initial);
  }

  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState(false);
  const [recoveredNotice, setRecoveredNotice] = useState(false);

  const gateRef = useRef(createFocusActionGate());
  const sessionRef = useRef(session);
  const autoAdvanceKeyRef = useRef<string | null>(null);
  const softGoalNotifiedRef = useRef<string | null>(null);
  const bootstrappedIdRef = useRef<string | null>(null);
  const optionsRef = useRef(options);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const refreshNow = useCallback(() => {
    setNow(Date.now());
  }, []);

  const persistAction = useCallback(
    async (
      action: FocusDomainAction,
      gateKey: string,
      options?: { allowWhenReadOnly?: boolean },
    ) => {
      const current = sessionRef.current;
      if (!current || !isActiveStatus(current.status)) return;
      if (
        optionsRef.current.readOnly &&
        !options?.allowWhenReadOnly &&
        action.type !== "recover" &&
        action.type !== "takeover"
      ) {
        return;
      }
      if (!gateRef.current.tryBegin(gateKey)) return;

      setPending(true);
      try {
        const wall = Date.now();
        // Reject clearly invalid transitions client-side (idempotent double-clicks).
        let nextLocal: FocusSession;
        try {
          nextLocal = applyFocusAction(current, action, {
            expectedRevision: current.revision,
            now: wall,
          }).session;
        } catch {
          if (typeof navigator !== "undefined" && navigator.onLine) {
            router.refresh();
          }
          return;
        }

        const actionId =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `offline-${wall}-${Math.random().toString(36).slice(2, 10)}`;
        const clientAt = new Date(wall).toISOString();
        const payload = toTransitionPayload(action, current, {
          actionId,
          clientAt,
        });
        if (!payload) return;

        const offline =
          typeof navigator !== "undefined" && navigator.onLine === false;

        if (offline) {
          // Policy: continue known sessions offline; never invent remote rows per tick.
          const queued = enqueueFocusTransition({
            userId: current.userId,
            actionId,
            session: nextLocal,
            expectedRevision: current.revision,
            clientTimestamp: clientAt,
            transition: payload,
          });
          if (!queued.ok && queued.reason === "storage") {
            toast.error(t("offline.storageFull"));
          } else {
            toast.message(t("offline.savedLocally"));
          }
          setSession(nextLocal);
          sessionRef.current = nextLocal;
          setNow(wall);
          cacheFocusSession(current.userId, nextLocal);
          optionsRef.current.onSessionCommitted?.(nextLocal, action.type);
          if (
            nextLocal.status === "completed" ||
            nextLocal.status === "cancelled"
          ) {
            cacheFocusSession(current.userId, null);
            optionsRef.current.onTerminal?.(nextLocal);
          }
          return;
        }

        const result = await transitionFocusSessionAction(payload);
        if (!result?.ok) {
          const code = result && !result.ok ? result.error.code : null;
          if (code === "REVISION_CONFLICT") {
            toast.error(t("engine.revisionConflict"));
            optionsRef.current.onRevisionConflict?.();
            router.refresh();
            return;
          }
          if (code === "INVALID_TRANSITION") {
            router.refresh();
            return;
          }
          // Network-ish failure while browser still thinks it is online:
          // queue for later instead of losing the transition.
          if (code === "UNAUTHORIZED") {
            toast.error(t("engine.persistError"));
            router.refresh();
            return;
          }
          if (code === "DATABASE_ERROR") {
            enqueueFocusTransition({
              userId: current.userId,
              actionId,
              session: nextLocal,
              expectedRevision: current.revision,
              clientTimestamp: clientAt,
              transition: payload,
            });
            setSession(nextLocal);
            sessionRef.current = nextLocal;
            setNow(wall);
            cacheFocusSession(current.userId, nextLocal);
            optionsRef.current.onSessionCommitted?.(nextLocal, action.type);
            toast.message(t("offline.savedLocally"));
            if (
              nextLocal.status === "completed" ||
              nextLocal.status === "cancelled"
            ) {
              cacheFocusSession(current.userId, null);
              optionsRef.current.onTerminal?.(nextLocal);
            }
            return;
          }
          toast.error(t("engine.persistError"));
          return;
        }

        const nextSession = result.data;
        setSession(nextSession);
        sessionRef.current = nextSession;
        setNow(Date.now());
        cacheFocusSession(nextSession.userId, nextSession);
        optionsRef.current.onSessionCommitted?.(nextSession, action.type);
        if (
          nextSession.status === "completed" ||
          nextSession.status === "cancelled"
        ) {
          cacheFocusSession(nextSession.userId, null);
          optionsRef.current.onTerminal?.(nextSession);
        }
        router.refresh();
      } finally {
        gateRef.current.end();
        setPending(false);
      }
    },
    [router, t],
  );

  // Bootstrap recovery once per active session id (reload / first mount).
  useEffect(() => {
    const current = session;
    if (!current || !isActiveStatus(current.status)) return;
    if (bootstrappedIdRef.current === current.id) return;
    bootstrappedIdRef.current = current.id;

    const wall = Date.now();
    const prep = prepareFocusSessionOnLoad(current, wall);
    if (!prep.recovered) return;

    let cancelled = false;
    void (async () => {
      const offline =
        typeof navigator !== "undefined" && navigator.onLine === false;
      if (offline) {
        // Continue known session offline: project recovery locally and queue.
        const actionId =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `recover-${wall}`;
        const clientAt = new Date(wall).toISOString();
        enqueueFocusTransition({
          userId: current.userId,
          actionId,
          session: prep.session,
          expectedRevision: current.revision,
          clientTimestamp: clientAt,
          transition: {
            type: "recover",
            sessionId: current.id,
            expectedRevision: current.revision,
            clientAt,
            actionId,
          },
        });
        if (cancelled) return;
        setSession(prep.session);
        sessionRef.current = prep.session;
        setRecoveredNotice(true);
        optionsRef.current.onRecovered?.(prep.session);
        optionsRef.current.onSessionCommitted?.(prep.session, "recover");
        cacheFocusSession(current.userId, prep.session);
        setNow(Date.now());
        return;
      }

      const result = await transitionFocusSessionAction({
        type: "recover",
        sessionId: current.id,
        expectedRevision: current.revision,
        clientAt: new Date(wall).toISOString(),
      });
      if (cancelled) return;
      if (!result?.ok) {
        const code = result && !result.ok ? result.error.code : null;
        if (code === "REVISION_CONFLICT" || code === "UNAUTHORIZED") {
          router.refresh();
          return;
        }
        // Keep the last server snapshot. Projecting a recovered revision
        // locally would poison the next write.
        setRecoveredNotice(true);
        optionsRef.current.onRecovered?.(current);
        setNow(Date.now());
        return;
      }
      const nextSession = result.data;
      setSession(nextSession);
      sessionRef.current = nextSession;
      setRecoveredNotice(true);
      optionsRef.current.onRecovered?.(nextSession);
      optionsRef.current.onSessionCommitted?.(nextSession, "recover");
      cacheFocusSession(nextSession.userId, nextSession);
      setNow(Date.now());
      if (
        nextSession.status === "completed" ||
        nextSession.status === "cancelled"
      ) {
        cacheFocusSession(nextSession.userId, null);
        optionsRef.current.onTerminal?.(nextSession);
      }
      router.refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [session, router]);

  // UI ticker only — never writes to Supabase.
  useEffect(() => {
    if (!session || !isActiveStatus(session.status)) return;
    const id = window.setInterval(() => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }
      setNow(Date.now());
    }, tickMs);
    return () => window.clearInterval(id);
  }, [session, tickMs]);

  // Recalculate when the tab becomes visible again.
  useEffect(() => {
    if (!session) return;

    const onVisible = () => {
      setNow(Date.now());
      const current = sessionRef.current;
      if (!current || !isActiveStatus(current.status)) return;
      const prep = prepareFocusSessionOnLoad(current, Date.now());
      if (prep.recovered) {
        void persistAction(
          { type: "recover" },
          `recover-visible:${current.id}:${current.revision}`,
        );
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        onVisible();
        return;
      }
      // Best-effort lock/background pause from device preferences.
      const prefs = loadFocusDevicePreferences();
      const current = sessionRef.current;
      if (
        prefs.lockScreenBehavior === "pause" &&
        current &&
        (current.status === "running" || current.status === "on_break")
      ) {
        void persistAction(
          { type: "pause" },
          `pause-lock:${current.id}:${current.revision}`,
        );
      }
    };

    window.addEventListener("pageshow", onVisible);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisible);
    return () => {
      window.removeEventListener("pageshow", onVisible);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisible);
    };
  }, [session, persistAction]);

  const snapshot = useMemo(
    () => (session ? evaluateFocusEngine(session, now) : null),
    [session, now],
  );

  // Auto-finish timed phases exactly once per open interval revision.
  useEffect(() => {
    if (!snapshot || !session) return;
    if (!snapshot.shouldAutoAdvance) return;
    if (pending || gateRef.current.isLocked) return;

    const open = session.intervals.find((item) => item.endedAt == null);
    const key = `${session.id}:${session.revision}:${open?.id ?? "none"}:auto`;
    if (autoAdvanceKeyRef.current === key) return;
    autoAdvanceKeyRef.current = key;
    void persistAction(autoAdvanceAction(), key);
  }, [snapshot, session, pending, persistAction]);

  // Soft stopwatch goal — notify once, do not auto-complete.
  useEffect(() => {
    if (!snapshot || !session) return;
    if (!snapshot.softGoalReached) return;
    const openId =
      session.intervals.find((item) => item.endedAt == null)?.id ?? "none";
    const key = `${session.id}:${openId}:soft`;
    if (softGoalNotifiedRef.current === key) return;
    softGoalNotifiedRef.current = key;
    optionsRef.current.onSoftGoal?.(session);
    void deliverFocusPhaseAlert(session, {
      kind: "soft_goal",
      locale: optionsRef.current.locale === "en" ? "en" : "es",
    });
  }, [snapshot, session]);

  // Neutral phase-change cues (sound / vibration / notification when allowed).
  const lastPhaseKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!session) return;
    const key = `${session.id}:${session.status}:${session.currentPhaseKind}:${session.currentCycle}`;
    if (lastPhaseKeyRef.current == null) {
      lastPhaseKeyRef.current = key;
      return;
    }
    if (lastPhaseKeyRef.current === key) return;
    lastPhaseKeyRef.current = key;
    const kind =
      session.status === "completed" ? "session_complete" : "phase_change";
    void deliverFocusPhaseAlert(session, {
      kind,
      locale: optionsRef.current.locale === "en" ? "en" : "es",
    });
  }, [session]);

  // Schedule / reschedule phase-end alert; clear on pause or terminal.
  // Depends on revision/status/phase — not the display tick — so timers are not reset every second.
  useEffect(() => {
    if (!session || !isActiveStatus(session.status)) {
      cancelFocusPhaseAlert();
      return;
    }
    if (session.status === "paused") {
      cancelFocusPhaseAlert();
      return;
    }
    scheduleFocusPhaseAlert(session, {
      locale: optionsRef.current.locale,
    });
  }, [
    session,
    session?.id,
    session?.revision,
    session?.status,
    session?.currentPhaseKind,
    session?.currentCycle,
  ]);

  // Screen Wake Lock only while an active non-paused session wants it.
  useEffect(() => {
    if (!session || !isActiveStatus(session.status)) {
      void releaseFocusWakeLock();
      return;
    }
    void syncFocusWakeLock(session);
  }, [
    session,
    session?.status,
    session?.revision,
    session?.config.keepScreenAwake,
  ]);

  // Visibility: re-acquire wake lock, clear badge, re-evaluate schedule.
  // Uses sessionRef so the listener always sees the latest session without rebinding every tick.
  const activeSessionId = session?.id ?? null;
  useEffect(() => {
    if (!activeSessionId) return;
    const onVisible = () => {
      void clearFocusAppBadge();
      void reacquireFocusWakeLockIfNeeded(sessionRef.current);
      const current = sessionRef.current;
      if (
        current &&
        isActiveStatus(current.status) &&
        current.status !== "paused"
      ) {
        scheduleFocusPhaseAlert(current, {
          locale: optionsRef.current.locale,
        });
      }
    };
    const onHidden = () => {
      // OS may release wake lock when hidden; keep desired flag via sync.
      void syncFocusWakeLock(sessionRef.current);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") onVisible();
      else onHidden();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [activeSessionId]);

  // Cleanup timers / wake lock when the engine unmounts.
  useEffect(() => {
    return () => {
      cancelFocusPhaseAlert();
      void releaseFocusWakeLock();
    };
  }, []);

  const pause = useCallback(
    () => persistAction({ type: "pause" }, "pause"),
    [persistAction],
  );
  const resume = useCallback(
    () => persistAction({ type: "resume" }, "resume"),
    [persistAction],
  );
  const complete = useCallback(
    () => persistAction({ type: "complete" }, "complete"),
    [persistAction],
  );
  const cancel = useCallback(
    () => persistAction({ type: "cancel" }, "cancel"),
    [persistAction],
  );
  const finishPhase = useCallback(
    () => persistAction({ type: "finish_phase" }, "finish_phase"),
    [persistAction],
  );
  const skipBreak = useCallback(
    () => persistAction({ type: "skip_break" }, "skip_break"),
    [persistAction],
  );
  const skipSegment = useCallback(
    () => persistAction({ type: "skip_segment" }, "skip_segment"),
    [persistAction],
  );
  const extendBreak = useCallback(
    (extraSec: number) =>
      persistAction({ type: "extend_break", extraSec }, `extend:${extraSec}`),
    [persistAction],
  );
  const recover = useCallback(
    () =>
      persistAction({ type: "recover" }, "recover", {
        allowWhenReadOnly: true,
      }),
    [persistAction],
  );
  const takeover = useCallback(
    () =>
      persistAction({ type: "takeover" }, "takeover", {
        allowWhenReadOnly: true,
      }),
    [persistAction],
  );

  return {
    session,
    snapshot,
    now,
    pending,
    recoveredNotice,
    clearRecoveredNotice: () => setRecoveredNotice(false),
    pause,
    resume,
    complete,
    cancel,
    finishPhase,
    skipBreak,
    skipSegment,
    extendBreak,
    recover,
    takeover,
    refreshNow,
  };
}

function toTransitionPayload(
  action: FocusDomainAction,
  session: FocusSession,
  meta?: { actionId?: string; clientAt?: string },
): FocusTransitionInput | null {
  const base = {
    sessionId: session.id,
    expectedRevision: session.revision,
    actionId: meta?.actionId,
    clientAt: meta?.clientAt,
  };
  switch (action.type) {
    case "pause":
    case "resume":
    case "skip_break":
    case "finish_phase":
    case "skip_segment":
    case "cancel":
    case "recover":
    case "takeover":
      return { ...base, type: action.type };
    case "begin_break":
      return { ...base, type: "begin_break", breakKind: action.breakKind };
    case "extend_break":
      return { ...base, type: "extend_break", extraSec: action.extraSec };
    case "complete":
      return {
        ...base,
        type: "complete",
        notes: action.notes,
        subjectiveFocus: action.subjectiveFocus,
        subjectiveEnergy: action.subjectiveEnergy,
      };
    case "start":
      return null;
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
