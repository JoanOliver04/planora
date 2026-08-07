"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { mapSessionRow } from "./mappers";
import { useFocusSession, type UseFocusSessionResult } from "./use-focus-session";
import type { FocusSession } from "./types";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

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
};

const FocusSessionContext = createContext<FocusSessionContextValue | null>(
  null,
);

async function fetchActiveSession(): Promise<FocusSession | null> {
  const db = createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;

  const { data: row } = await db
    .from("focus_sessions")
    .select("*")
    .eq("user_id", user.id)
    .in("status", ["running", "paused", "on_break"])
    .maybeSingle();
  if (!row) return null;

  const { data: intervals } = await db
    .from("focus_intervals")
    .select("*")
    .eq("user_id", user.id)
    .eq("session_id", row.id)
    .order("sequence", { ascending: true });

  return mapSessionRow(row, intervals ?? []);
}

export function FocusSessionProvider({
  children,
  initialSession = null,
}: {
  children: ReactNode;
  initialSession?: FocusSession | null;
}) {
  const t = useTranslations("Focus");
  const [seed, setSeed] = useState<FocusSession | null>(initialSession);
  const [seedKey, setSeedKey] = useState(() => sessionKey(initialSession));
  const [initialLoaded, setInitialLoaded] = useState(Boolean(initialSession));
  const [immersive, setImmersive] = useState(false);
  const [lastCompleted, setLastCompleted] = useState<FocusSession | null>(
    null,
  );

  // Sync server-provided initial session without an effect.
  const incomingKey = sessionKey(initialSession);
  if (initialSession && incomingKey !== seedKey) {
    setSeedKey(incomingKey);
    setSeed(initialSession);
    setInitialLoaded(true);
  }

  const reloadActiveSession = useCallback(async () => {
    try {
      const next = await fetchActiveSession();
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
  }, []);

  const engine = useFocusSession(seed, {
    onRecovered: () => toast.message(t("engine.recovered")),
    onSoftGoal: () => toast.message(t("engine.softGoal")),
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
    },
  });

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
    }),
    [
      engine,
      initialLoaded,
      immersive,
      reloadActiveSession,
      hydrateSession,
      lastCompleted,
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
