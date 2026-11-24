"use client";
import { useEffect, useRef, useState } from "react";
import { Cloud, CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { withOfflineLock } from "@/lib/offline/lock";
import {
  canUseClientSession,
  clientSessionGeneration,
} from "@/lib/security/client-session";
import { createClient } from "@/lib/supabase/client";
import {
  completionQueueKey,
  flushCompletionQueue,
  getQueuedCompletions,
} from "@/lib/offline/queue";
import {
  focusQueueKey,
  flushFocusOfflineQueue,
  getFocusOfflinePendingCount,
} from "@/features/focus/focus-offline";

export function OfflineStatus({
  locale,
  userId,
}: {
  locale: string;
  userId: string;
}) {
  const es = locale === "es";
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [conflicts, setConflicts] = useState(0);
  const retry = useRef<() => void>(() => {});
  useEffect(() => {
    let active = true;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = 5000;
    let lastCount = 0;
    const count = () =>
      getQueuedCompletions(userId).length + getFocusOfflinePendingCount(userId);
    const updateCount = () => {
      lastCount = count();
      setPending(lastCount);
      setOnline(navigator.onLine);
      return lastCount;
    };
    const sync = async () => {
      if (!active || !navigator.onLine || running || !updateCount()) return;
      running = true;
      setSyncing(true);
      const generation = clientSessionGeneration(userId);
      const current = () => active && canUseClientSession(userId, generation);
      try {
        await withOfflineLock("sync:" + userId, async () => {
          if (!current() || !count() || !navigator.onLine) return;
          const db = createClient();
          const {
            data: { session },
          } = await db.auth.getSession();
          if (!current() || session?.user.id !== userId) return;
          const [tasks, focus] = await Promise.allSettled([
            flushCompletionQueue(db, userId),
            flushFocusOfflineQueue(db, userId),
          ]);
          if (!current()) return;
          const taskResult =
            tasks.status === "fulfilled" ? tasks.value : undefined;
          const focusResult =
            focus.status === "fulfilled" ? focus.value : undefined;
          const conflicts =
            (taskResult?.conflicts ?? 0) + (focusResult?.conflicts ?? 0);
          if (conflicts) setConflicts((value) => value + conflicts);
          if (conflicts || taskResult?.synced || focusResult?.synced) {
            window.dispatchEvent(new CustomEvent("planora-sync-complete"));
            delay = 5000;
          }
          if (focusResult?.blocked)
            window.dispatchEvent(
              new CustomEvent("planora-focus-offline-conflict"),
            );
        });
      } catch {
        // Auth and connectivity can fail before a queue is reached. Retry below.
      } finally {
        running = false;
        if (active) {
          setSyncing(false);
          if (
            updateCount() &&
            navigator.onLine &&
            canUseClientSession(userId)
          ) {
            timer = setTimeout(() => {
              timer = undefined;
              void sync();
            }, delay);
            delay = Math.min(delay * 2, 60000);
          }
        }
      }
    };
    const update = () => {
      if (!active) return;
      const pending = updateCount();
      if (!navigator.onLine || !pending) {
        clearTimeout(timer);
        timer = undefined;
        delay = 5000;
      } else if (!timer) void sync();
    };
    const retryNow = () => {
      clearTimeout(timer);
      timer = undefined;
      delay = 5000;
      update();
    };
    const onStorage = (event: StorageEvent) => {
      if (
        event.key !== completionQueueKey &&
        event.key !== focusQueueKey &&
        event.key !== null
      )
        return;
      const previous = lastCount;
      update();
      if (previous > lastCount)
        window.dispatchEvent(new CustomEvent("planora-sync-complete"));
    };
    retry.current = retryNow;
    window.addEventListener("online", retryNow);
    window.addEventListener("offline", update);
    window.addEventListener("planora-offline-queue", update);
    window.addEventListener("storage", onStorage);
    queueMicrotask(update);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener("online", retryNow);
      window.removeEventListener("offline", update);
      window.removeEventListener("planora-offline-queue", update);
      window.removeEventListener("storage", onStorage);
    };
  }, [userId]);

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
              ? `Sin conexión · ${pending} ${pending === 1 ? "cambio guardado" : "cambios guardados"} en el dispositivo`
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
                ? `${conflicts} ${conflicts === 1 ? "conflicto de sincronización" : "conflictos de sincronización"} · Se conservó el estado del servidor`
                : `${conflicts} sync ${conflicts === 1 ? "conflict" : "conflicts"} · Server state kept`
              : es
                ? `${pending} ${pending === 1 ? "cambio pendiente" : "cambios pendientes"} de sincronizar`
                : `${pending} pending ${pending === 1 ? "change" : "changes"} to sync`}
      </span>
      {online && pending > 0 && (
        <button
          disabled={syncing}
          onClick={() => retry.current()}
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
