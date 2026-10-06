"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { WorkspaceData } from "./types";
import type { WorkspaceMode } from "./types";
import { localDate, localWeek } from "@/lib/dates/timezone";
import { cacheWorkspace, loadCachedWorkspace } from "@/lib/offline/queue";
import { getMonthEventRange, mergeRowsById } from "./workspace-data";
import {
  decideBootstrapPhase,
  type BootstrapPhase,
} from "@/lib/bootstrap/phase";
import { logBootstrap } from "@/lib/bootstrap/log";
import {
  AUTH_TIMEOUT_MS,
  QUERY_TIMEOUT_MS,
  isTimeoutError,
  withTimeout,
} from "@/lib/bootstrap/timeout";

const requirements: Record<
  WorkspaceMode,
  ReadonlySet<"categories" | "tasks" | "events" | "completions">
> = {
  today: new Set(["categories", "tasks", "events", "completions"]),
  week: new Set(["categories", "tasks", "events"]),
  month: new Set(["categories", "tasks", "events"]),
  search: new Set(["categories", "tasks", "events"]),
  summary: new Set(["categories", "tasks", "events", "completions"]),
  tasks: new Set(["categories", "tasks", "completions"]),
  events: new Set(["categories", "events"]),
  history: new Set(["completions"]),
  statistics: new Set(["categories", "tasks", "completions"]),
  schedules: new Set(),
  categories: new Set(["categories"]),
  settings: new Set(),
};

export function useWorkspace(mode: WorkspaceMode) {
  const [db] = useState(createClient),
    [data, setData] = useState<WorkspaceData | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [phase, setPhase] = useState<BootstrapPhase>("loading"),
    pendingEventRanges = useRef(new Set<string>()),
    presentedRef = useRef(false);
  const finish = useCallback(
    (next: {
      timedOut?: boolean;
      online?: boolean;
      hasSession?: boolean;
      authError?: boolean;
      hasFreshData?: boolean;
      hasCache?: boolean;
      requestFailed?: boolean;
      fatal?: boolean;
      errorCode?: string | null;
      workspace?: WorkspaceData | null;
    }) => {
      const decided = decideBootstrapPhase({
        settled: true,
        timedOut: Boolean(next.timedOut),
        online: next.online ?? navigator.onLine,
        hasSession: Boolean(next.hasSession),
        authError: Boolean(next.authError),
        hasFreshData: Boolean(next.hasFreshData),
        hasCache: Boolean(next.hasCache),
        requestFailed: Boolean(next.requestFailed),
        fatal: next.fatal,
      });
      if (next.workspace) {
        setData(next.workspace);
        presentedRef.current = true;
      }
      setPhase(decided);
      setLoading(false);
      setError(
        decided === "authenticated" || decided === "loading"
          ? null
          : (next.errorCode ?? decided),
      );
      if (decided !== "authenticated")
        logBootstrap({
          phase: decided,
          errorType: next.errorCode ?? decided,
          code: next.errorCode ?? decided,
          online: next.online ?? navigator.onLine,
        });
    },
    [],
  );
  const loadEventRange = useCallback(
    async (start: string, end: string) => {
      const range = `${start}:${end}`;
      if (pendingEventRanges.current.has(range)) return true;
      pendingEventRanges.current.add(range);
      const { data: events, error: rangeError } = await db
        .from("events")
        .select("*")
        .gte("event_date", start)
        .lte("event_date", end)
        .order("event_date");
      if (rangeError) {
        pendingEventRanges.current.delete(range);
        return false;
      }
      pendingEventRanges.current.delete(range);
      setData((current) => {
        if (!current) return current;
        const next = {
          ...current,
          events: mergeRowsById(current.events, events ?? []),
        };
        cacheWorkspace(mode, next);
        return next;
      });
      return true;
    },
    [db, mode],
  );
  const loadDate = useCallback(
    async (day: string) => {
      if (mode !== "today") return true;
      const [events, completions] = await Promise.all([
        db.from("events").select("*").eq("event_date", day),
        db.from("task_completions").select("*").eq("occurrence_date", day),
      ]);
      if (events.error || completions.error) return false;
      setData((current) => {
        if (!current) return current;
        const next = {
          ...current,
          events: mergeRowsById(current.events, events.data ?? []),
          completions: mergeRowsById(
            current.completions,
            completions.data ?? [],
          ),
        };
        cacheWorkspace(mode, next);
        return next;
      });
      return true;
    },
    [db, mode],
  );
  const load = useCallback(async () => {
    setError(null);
    if (!presentedRef.current) {
      setPhase("loading");
      setLoading(true);
    }
    let session: { user?: { id: string; email?: string } | null } | null = null;
    try {
      const result = await withTimeout(db.auth.getSession(), AUTH_TIMEOUT_MS);
      session = result.data.session;
    } catch (error) {
      finish({
        timedOut: isTimeoutError(error),
        requestFailed: !isTimeoutError(error),
        online: navigator.onLine,
        errorCode: isTimeoutError(error) ? "timeout" : "session",
      });
      return;
    }
    const sessionUserId = session?.user?.id;
    const cached = sessionUserId
      ? loadCachedWorkspace(sessionUserId, mode)
      : null;
    if (cached)
      finish({
        hasSession: true,
        hasCache: true,
        workspace: cached,
      });
    if (!navigator.onLine) {
      if (!cached)
        finish({
          online: false,
          hasSession: Boolean(sessionUserId),
          hasCache: false,
          errorCode: "offline",
        });
      return;
    }
    let user: { id: string; email?: string } | null = session?.user ?? null;
    if (!user) {
      try {
        const {
          data: { user: nextUser },
          error: authError,
        } = await withTimeout(db.auth.getUser(), AUTH_TIMEOUT_MS);
        if (authError || !nextUser) {
          finish({
            hasSession: Boolean(sessionUserId),
            authError: true,
            hasCache: Boolean(cached),
            workspace: cached,
            errorCode: "auth",
          });
          return;
        }
        user = nextUser;
      } catch (error) {
        finish({
          timedOut: isTimeoutError(error),
          hasSession: Boolean(sessionUserId),
          authError: true,
          hasCache: Boolean(cached),
          workspace: cached,
          errorCode: isTimeoutError(error) ? "timeout" : "auth",
        });
        return;
      }
    }
    let profile;
    try {
      const result = await withTimeout(
        db.from("profiles").select("*").eq("id", user.id).single(),
        QUERY_TIMEOUT_MS,
      );
      profile = result.data;
      if (result.error || !profile) {
        const profileCache = loadCachedWorkspace(user.id, mode);
        finish({
          hasSession: true,
          hasCache: Boolean(profileCache),
          requestFailed: true,
          workspace: profileCache,
          errorCode: result.error?.message ?? "profile",
        });
        return;
      }
    } catch (error) {
      const profileCache = loadCachedWorkspace(user.id, mode);
      finish({
        timedOut: isTimeoutError(error),
        hasSession: true,
        hasCache: Boolean(profileCache),
        requestFailed: true,
        workspace: profileCache,
        errorCode: isTimeoutError(error) ? "timeout" : "profile",
      });
      return;
    }
    const today = localDate(profile.timezone);
    const week = localWeek(
      profile.timezone,
      new Date(),
      profile.week_starts_on === 0 ? 0 : 1,
    );
    const historyFrom = new Date(`${week.start}T00:00:00Z`);
    historyFrom.setUTCDate(historyFrom.getUTCDate() - 90);
    const monthRange = getMonthEventRange(
      today,
      profile.week_starts_on === 0 ? 0 : 1,
    );
    const needed = requirements[mode];
    const empty = Promise.resolve({ data: [], error: null });
    const eventsQuery = db.from("events").select("*").order("event_date");
    if (mode === "summary") eventsQuery.eq("event_date", today);
    else if (mode === "today")
      eventsQuery
        .gte("event_date", historyFrom.toISOString().slice(0, 10))
        .lte("event_date", today);
    else if (mode === "week")
      eventsQuery.gte("event_date", week.start).lte("event_date", week.end);
    else if (mode === "month")
      eventsQuery
        .gte("event_date", monthRange.start)
        .lte("event_date", monthRange.end);
    let completionsQuery = db
      .from("task_completions")
      .select("*")
      .order("completed_at", { ascending: false });
    if (mode === "summary")
      completionsQuery = completionsQuery.eq("occurrence_date", today);
    else if (mode !== "tasks")
      completionsQuery = completionsQuery.gte(
        "occurrence_date",
        historyFrom.toISOString().slice(0, 10),
      );
    // The task list only uses completions to tell whether a one-time task is
    // done. Recurring history is unused there; once-tasks are loaded below
    // with no date cutoff, so this query must not download every row.
    else completionsQuery = completionsQuery.limit(0);
    let s, c, t, e, h, p;
    try {
      [s, c, t, e, h, p] = await withTimeout(
        Promise.all([
          db
            .from("schedules")
            .select("*")
            .order("sort_order")
            .order("created_at"),
          needed.has("categories")
            ? db.from("categories").select("*").order("sort_order")
            : empty,
          needed.has("tasks")
            ? db
                .from("tasks")
                .select("*")
                .order("sort_order")
                .order("created_at")
            : empty,
          needed.has("events") ? eventsQuery : empty,
          needed.has("completions") ? completionsQuery : empty,
          needed.has("tasks")
            ? db
                .from("focus_presets")
                .select("id,name,emoji,archived_at")
                .is("archived_at", null)
                .order("sort_order")
            : empty,
        ]),
        QUERY_TIMEOUT_MS,
      );
    } catch (error) {
      const queryCache = loadCachedWorkspace(user.id, mode);
      finish({
        timedOut: isTimeoutError(error),
        hasSession: true,
        hasCache: Boolean(queryCache),
        requestFailed: true,
        workspace: queryCache,
        errorCode: isTimeoutError(error) ? "timeout" : "query",
      });
      return;
    }
    const firstError = [
      s.error,
      c.error,
      t.error,
      e.error,
      h.error,
      p.error,
    ].find(Boolean);
    if (firstError) {
      const queryCache = loadCachedWorkspace(user.id, mode);
      finish({
        hasSession: true,
        hasCache: Boolean(queryCache),
        requestFailed: true,
        workspace: queryCache,
        errorCode: firstError.message,
      });
      return;
    }
    try {
      let completions = h.data ?? [];
      if (mode === "today" || mode === "tasks") {
        const onceTaskIds = (t.data ?? [])
          .filter((task) => task.recurrence_type === "once")
          .map((task) => task.id);
        for (let offset = 0; offset < onceTaskIds.length; offset += 100) {
          const { data: onceCompletions, error: onceError } = await withTimeout(
            db
              .from("task_completions")
              .select("*")
              .in("task_id", onceTaskIds.slice(offset, offset + 100)),
            QUERY_TIMEOUT_MS,
          );
          if (onceError) {
            const queryCache = loadCachedWorkspace(user.id, mode);
            finish({
              hasSession: true,
              hasCache: Boolean(queryCache),
              requestFailed: true,
              workspace: queryCache,
              errorCode: onceError.message,
            });
            return;
          }
          const byId = new Map(completions.map((item) => [item.id, item]));
          (onceCompletions ?? []).forEach((item) => byId.set(item.id, item));
          completions = [...byId.values()];
        }
      }
      const workspace: WorkspaceData = {
        user: {
          id: user.id,
          email: user.email,
        },
        profile,
        schedules: s.data ?? [],
        categories: c.data ?? [],
        tasks: t.data ?? [],
        events: e.data ?? [],
        completions,
        focusPresets: p.data ?? [],
      };
      cacheWorkspace(mode, workspace);
      finish({
        hasSession: true,
        hasFreshData: true,
        workspace,
      });
    } catch (error) {
      const queryCache = loadCachedWorkspace(user.id, mode);
      finish({
        timedOut: isTimeoutError(error),
        hasSession: true,
        hasCache: Boolean(queryCache),
        requestFailed: true,
        workspace: queryCache,
        errorCode: isTimeoutError(error) ? "timeout" : "query",
      });
    }
  }, [db, finish, mode]);
  useEffect(() => {
    queueMicrotask(() => void load());
    const synced = () => void load();
    const reconnect = () => {
      if (navigator.onLine) void load();
    };
    window.addEventListener("planora-sync-complete", synced);
    window.addEventListener("online", reconnect);
    return () => {
      window.removeEventListener("planora-sync-complete", synced);
      window.removeEventListener("online", reconnect);
    };
  }, [load]);
  return {
    db,
    data,
    loading,
    error,
    phase,
    reload: load,
    loadDate,
    loadEventRange,
  };
}
