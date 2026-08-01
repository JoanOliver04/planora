"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Cloud, CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  flushCompletionQueue,
  getQueuedCompletions,
} from "@/lib/offline/queue";

export function OfflineStatus({ locale }: { locale: string }) {
  const es = locale === "es";
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [conflicts, setConflicts] = useState(0);
  const syncingRef = useRef(false);
  const sync = useCallback(async () => {
    setOnline(navigator.onLine);
    setPending(getQueuedCompletions().length);
    if (!navigator.onLine || syncingRef.current) return;
    const db = createClient();
    const {
      data: { session },
    } = await db.auth.getSession();
    if (!session?.user) return;
    const ownPending = getQueuedCompletions(session.user.id).length;
    setPending(ownPending);
    if (!ownPending) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const result = await flushCompletionQueue(db, session.user.id);
      setPending(result.remaining);
      setConflicts(result.conflicts);
      if (!result.remaining)
        window.dispatchEvent(new CustomEvent("planora-sync-complete"));
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);
  useEffect(() => {
    const update = () => void sync();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("planora-offline-queue", update);
    queueMicrotask(update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("planora-offline-queue", update);
    };
  }, [sync]);
  if (online && !pending && !conflicts) return null;
  return (
    <aside
      className="offline-status"
      data-online={online}
      role="status"
      aria-live="polite"
    >
      {conflicts ? (
        <TriangleAlert size={16} />
      ) : online ? (
        <Cloud size={16} />
      ) : (
        <CloudOff size={16} />
      )}
      <span>
        {!online
          ? es
            ? "Sin conexión"
            : "Offline"
          : syncing
            ? es
              ? "Sincronizando…"
              : "Syncing…"
            : conflicts
              ? es
                ? conflicts + " conflicto(s) resueltos con tu último cambio"
                : conflicts + " conflict(s) resolved using your latest change"
              : es
                ? pending + " cambio(s) pendientes"
                : pending + " pending change(s)"}
      </span>
      {online && pending > 0 && (
        <button
          onClick={() => void sync()}
          aria-label={es ? "Reintentar sincronización" : "Retry sync"}
        >
          <RefreshCw size={14} />
        </button>
      )}
      {conflicts > 0 && (
        <button onClick={() => setConflicts(0)}>
          {es ? "Entendido" : "Dismiss"}
        </button>
      )}
    </aside>
  );
}
