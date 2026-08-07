"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Cloud, CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  flushCompletionQueue,
  getQueuedCompletions,
} from "@/lib/offline/queue";
import {
  flushFocusOfflineQueue,
  getFocusOfflinePendingCount,
} from "@/features/focus/focus-offline";

export function OfflineStatus({ locale }: { locale: string }) {
  const es = locale === "es";
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [conflicts, setConflicts] = useState(0);
  const syncingRef = useRef(false);

  const countPending = useCallback((userId?: string) => {
    return (
      getQueuedCompletions(userId).length + getFocusOfflinePendingCount(userId)
    );
  }, []);

  const sync = useCallback(async () => {
    setOnline(navigator.onLine);
    setPending(countPending());
    if (!navigator.onLine || syncingRef.current) return;
    const db = createClient();
    const {
      data: { session },
    } = await db.auth.getSession();
    if (!session?.user) return;
    const ownPending = countPending(session.user.id);
    setPending(ownPending);
    if (!ownPending) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const [completions, focus] = await Promise.all([
        flushCompletionQueue(db, session.user.id),
        flushFocusOfflineQueue(db, session.user.id),
      ]);
      setPending(countPending(session.user.id));
      setConflicts(completions.conflicts + focus.conflicts);
      if (!countPending(session.user.id)) {
        window.dispatchEvent(new CustomEvent("planora-sync-complete"));
      }
      if (focus.blocked) {
        window.dispatchEvent(new CustomEvent("planora-focus-offline-conflict"));
      }
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [countPending]);

  useEffect(() => {
    const update = () => void sync();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("planora-offline-queue", update);
    window.addEventListener("planora-focus-offline", update);
    queueMicrotask(update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("planora-offline-queue", update);
      window.removeEventListener("planora-focus-offline", update);
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
            ? pending
              ? `Sin conexión · ${pending} guardado(s) en el dispositivo`
              : "Sin conexión"
            : pending
              ? `Offline · ${pending} saved on this device`
              : "Offline"
          : syncing
            ? es
              ? "Sincronizando…"
              : "Syncing…"
            : conflicts
              ? es
                ? conflicts +
                  " conflicto(s) de sincronización (se usó el estado del servidor)"
                : conflicts +
                  " sync conflict(s) (server state was kept)"
              : es
                ? pending + " cambio(s) pendientes de sincronizar"
                : pending + " pending change(s) to sync"}
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
