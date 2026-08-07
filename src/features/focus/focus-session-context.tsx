"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  useFocusSession,
  type UseFocusSessionResult,
} from "./use-focus-session";
import type { FocusSession } from "./types";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import {
  createFocusSyncBus,
  decideRemoteSession,
  FOCUS_SYNC_POLL_MS,
  type FocusControlMode,
  type FocusSyncBus,
  type FocusSyncEvent,
} from "./focus-sync";
import {
  fetchActiveFocusSessionFull,
  reconcileFocusSessionFromServer,
} from "./focus-sync-poll";
import {
  clearFocusOfflineQueue,
  loadCachedFocusSession,
} from "./focus-offline";
import { isActiveStatus } from "./time";
import { createClient } from "@/lib/supabase/client";

type FocusSessionContextValue = {
  engine: UseFocusSessionResult;
  initialLoaded: boolean;
  immersive: boolean;
  setImmersive: (value: boolean) => void;
  reloadActiveSession: () => Promise<void>;
  /** Seed/replace the active session from a server page payload. */
  hydrateSession: (session: FocusSession | null) => void;
  /** Last completed session for the neutral summary card. */
  lastCompleted: FocusSession | null;
  clearLastCompleted: () => void;
  /** This tab/device may write; follower is view-only until takeover. */
  controlMode: FocusControlMode;
  clientId: string;
  /** Explicit “Continue here” after multi-tab/device conflict. */
  requestTakeover: () => Promise<void>;
  takeoverDialogOpen: boolean;
  setTakeoverDialogOpen: (open: boolean) => void;
};

const FocusSessionContext = createContext<FocusSessionContextValue | null>(
  null,
);

export function FocusSessionProvider({
  children,
  initialSession = null,
}: {
  children: ReactNode;
  initialSession?: FocusSession | null;
}) {
  const t = useTranslations("Focus");
  const locale = useLocale();
  const [seed, setSeed] = useState<FocusSession | null>(initialSession);
  const [seedKey, setSeedKey] = useState(() => sessionKey(initialSession));
  const [initialLoaded, setInitialLoaded] = useState(Boolean(initialSession));
  const [immersive, setImmersive] = useState(false);
  const [lastCompleted, setLastCompleted] = useState<FocusSession | null>(null);
  const [controlMode, setControlMode] =
    useState<FocusControlMode>("controller");
  const [takeoverDialogOpen, setTakeoverDialogOpen] = useState(false);
  const [clientId, setClientId] = useState("ssr");

  const busRef = useRef<FocusSyncBus | null>(null);
  const seedRef = useRef(seed);

  useEffect(() => {
    seedRef.current = seed;
  }, [seed]);

  // Sync server-provided initial session without an effect.
  const incomingKey = sessionKey(initialSession);
  if (initialSession && incomingKey !== seedKey) {
    setSeedKey(incomingKey);
    setSeed(initialSession);
    setInitialLoaded(true);
  }

  const applyRemoteSession = useCallback(
    (
      remote: FocusSession | null,
      source: "broadcast" | "poll" | "conflict",
    ) => {
      const decision = decideRemoteSession(seedRef.current, remote);
      if (decision === "ignore") return;

      if (decision === "clear") {
        setSeed(null);
        setSeedKey("none");
        setControlMode("controller");
        setImmersive(false);
        if (source !== "conflict") {
          toast.message(t("sync.endedElsewhere"));
        }
        return;
      }

      // apply
      if (!remote) return;
      setSeed(remote);
      setSeedKey(sessionKey(remote));
      setInitialLoaded(true);

      if (!isActiveStatus(remote.status)) {
        if (remote.status === "completed" || remote.status === "cancelled") {
          setLastCompleted(remote);
        }
        setControlMode("controller");
        setImmersive(false);
        return;
      }

      if (source === "broadcast" || source === "poll") {
        setControlMode("follower");
        if (source === "broadcast") {
          toast.message(t("sync.updatedElsewhere"));
        } else if (source === "poll") {
          toast.message(t("sync.updatedElsewhere"));
        }
      }
    },
    [t],
  );

  const reloadActiveSession = useCallback(async () => {
    try {
      const next = await fetchActiveFocusSessionFull();
      setSeed(next);
      setSeedKey(sessionKey(next));
      setInitialLoaded(true);
    } catch {
      setInitialLoaded(true);
    }
  }, []);

  const hydrateSession = useCallback((session: FocusSession | null) => {
    setSeed(session);
    setSeedKey(sessionKey(session));
    setInitialLoaded(true);
    if (session && isActiveStatus(session.status)) {
      setControlMode("controller");
      busRef.current?.publishSession(session, "session_started");
    }
  }, []);

  const onSessionCommitted = useCallback(
    (session: FocusSession, action: string) => {
      setControlMode("controller");
      if (action === "takeover") {
        busRef.current?.publishSession(session, "takeover");
        toast.success(t("sync.takeoverDone"));
        return;
      }
      if (session.status === "completed" || session.status === "cancelled") {
        busRef.current?.publishSession(session, "session_ended");
        return;
      }
      busRef.current?.publishSession(session, "session_updated");
    },
    [t],
  );

  const onRevisionConflict = useCallback(() => {
    setControlMode("follower");
    void (async () => {
      try {
        const result = await reconcileFocusSessionFromServer(seedRef.current);
        if (result.changed) {
          applyRemoteSession(result.session, "conflict");
        } else {
          await reloadActiveSession();
        }
      } catch {
        await reloadActiveSession();
      }
    })();
  }, [applyRemoteSession, reloadActiveSession]);

  const engine = useFocusSession(seed, {
    locale,
    readOnly: controlMode === "follower",
    onRecovered: () => toast.message(t("engine.recovered")),
    onSoftGoal: () => toast.message(t("engine.softGoal")),
    onSessionCommitted,
    onRevisionConflict,
    onTerminal: (session) => {
      if (session.status === "completed") {
        toast.success(t("engine.completed"));
        setLastCompleted(session);
      } else if (session.status === "cancelled") {
        toast.message(t("engine.cancelled"));
        setLastCompleted(session);
      }
      setImmersive(false);
      setSeed(null);
      setSeedKey("none");
      setControlMode("controller");
    },
  });

  // Keep seed aligned with live engine session for poll comparisons.
  useEffect(() => {
    if (engine.session) {
      seedRef.current = engine.session;
    }
  }, [engine.session]);

  const requestTakeover = useCallback(async () => {
    if (!engine.session || !isActiveStatus(engine.session.status)) {
      setTakeoverDialogOpen(false);
      return;
    }
    await engine.takeover();
    setTakeoverDialogOpen(false);
  }, [engine]);

  // Offline: restore last known active session so the timer can continue.
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (navigator.onLine) return;
    if (seedRef.current) return;
    void (async () => {
      try {
        const db = createClient();
        const {
          data: { user },
        } = await db.auth.getUser();
        if (!user) return;
        const cached = loadCachedFocusSession(user.id);
        if (cached && isActiveStatus(cached.status)) {
          setSeed(cached);
          setSeedKey(sessionKey(cached));
          setInitialLoaded(true);
          toast.message(t("offline.restoredLocal"));
        }
      } catch {
        // ignore
      }
    })();
  }, [t]);

  // Offline sync conflict: drop local queue tail and re-fetch server authority.
  useEffect(() => {
    const onConflict = () => {
      toast.error(t("offline.conflict"));
      setControlMode("follower");
      void (async () => {
        try {
          const db = createClient();
          const {
            data: { user },
          } = await db.auth.getUser();
          if (user) clearFocusOfflineQueue(user.id);
          const remote = await fetchActiveFocusSessionFull();
          applyRemoteSession(remote, "conflict");
        } catch {
          // ignore
        }
      })();
    };
    window.addEventListener("planora-focus-offline-conflict", onConflict);
    return () => {
      window.removeEventListener("planora-focus-offline-conflict", onConflict);
    };
  }, [applyRemoteSession, t]);

  // Cross-tab bus
  useEffect(() => {
    const bus = createFocusSyncBus((event: FocusSyncEvent) => {
      if (event.type === "request_sync") {
        const current = seedRef.current ?? engine.session;
        if (current && isActiveStatus(current.status)) {
          bus.publishSession(current, "session_updated");
        }
        return;
      }

      if (event.type === "session_ended") {
        if (event.session) {
          applyRemoteSession(event.session, "broadcast");
        } else {
          applyRemoteSession(null, "broadcast");
        }
        return;
      }

      if (
        event.type === "session_started" ||
        event.type === "session_updated" ||
        event.type === "takeover"
      ) {
        if (event.session) {
          applyRemoteSession(event.session, "broadcast");
        } else if (event.sessionId) {
          void fetchActiveFocusSessionFull().then((full) => {
            applyRemoteSession(full, "broadcast");
          });
        }
      }
    });
    busRef.current = bus;
    setClientId(bus.clientId);
    // Ask sibling tabs for their state when we open.
    bus.requestSync();
    return () => {
      bus.close();
      busRef.current = null;
    };
    // Intentionally once on mount — handlers use refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount bus once
  }, []);

  // Light multi-device poll + visibility / online reconciliation
  useEffect(() => {
    let cancelled = false;

    const reconcile = async () => {
      if (cancelled || !navigator.onLine) return;
      try {
        const result = await reconcileFocusSessionFromServer(
          seedRef.current ?? engine.session,
        );
        if (cancelled || !result.changed) return;
        if (result.reason === "ended") {
          applyRemoteSession(null, "poll");
          return;
        }
        applyRemoteSession(result.session, "poll");
      } catch {
        // offline / auth — ignore
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void reconcile();
    };

    void reconcile();
    const timer = window.setInterval(
      () => void reconcile(),
      FOCUS_SYNC_POLL_MS,
    );
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, [applyRemoteSession, engine.session]);

  const value = useMemo<FocusSessionContextValue>(
    () => ({
      engine,
      initialLoaded,
      immersive,
      setImmersive,
      reloadActiveSession,
      hydrateSession,
      lastCompleted,
      clearLastCompleted: () => setLastCompleted(null),
      controlMode,
      clientId,
      requestTakeover,
      takeoverDialogOpen,
      setTakeoverDialogOpen,
    }),
    [
      engine,
      initialLoaded,
      immersive,
      reloadActiveSession,
      hydrateSession,
      lastCompleted,
      controlMode,
      clientId,
      requestTakeover,
      takeoverDialogOpen,
    ],
  );

  return (
    <FocusSessionContext.Provider value={value}>
      {children}
    </FocusSessionContext.Provider>
  );
}

function sessionKey(session: FocusSession | null) {
  if (!session) return "none";
  return `${session.id}:${session.revision}:${session.status}`;
}

export function useFocusSessionContext() {
  const ctx = useContext(FocusSessionContext);
  if (!ctx) {
    throw new Error(
      "useFocusSessionContext must be used within FocusSessionProvider",
    );
  }
  return ctx;
}

export function useOptionalFocusSessionContext() {
  return useContext(FocusSessionContext);
}
