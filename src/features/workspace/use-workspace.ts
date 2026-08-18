"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { WorkspaceData } from "./types";
import type { WorkspaceMode } from "./types";
import { localDate, localWeek } from "@/lib/dates/timezone";
import { cacheWorkspace, loadCachedWorkspace } from "@/lib/offline/queue";
import { mergeRowsById } from "./workspace-data";

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
    [error, setError] = useState<string | null>(null);
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
    const {
      data: { session },
    } = await db.auth.getSession();
    const cached = session?.user?.id
      ? loadCachedWorkspace(session.user.id, mode)
      : null;
    if (cached) {
      setData(cached);
      setLoading(false);
    }
    if (!navigator.onLine && cached) return;
    if (!navigator.onLine && session?.user?.id) {
      setLoading(false);
      setError("offline");
      return;
    }
    const {
      data: { user },
      error: authError,
    } = await db.auth.getUser();
    if (authError || !user) {
      const authCache = session?.user?.id
        ? loadCachedWorkspace(session.user.id, mode)
        : null;
      if (authCache) {
        setData(authCache);
        setLoading(false);
        setError(null);
        return;
      }
      setLoading(false);
      setError("auth");
      return;
    }
    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    if (profileError || !profile) {
      const profileCache = loadCachedWorkspace(user.id, mode);
      if (profileCache) {
        setData(profileCache);
        setLoading(false);
        return;
      }
      setLoading(false);
      setError(profileError?.message ?? "profile");
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
    const needed = requirements[mode];
    const empty = Promise.resolve({ data: [], error: null });
    const eventsQuery = db.from("events").select("*").order("event_date");
    if (mode === "summary") eventsQuery.eq("event_date", today);
    else if (mode === "today")
      eventsQuery
        .gte("event_date", historyFrom.toISOString().slice(0, 10))
        .lte("event_date", today);
    else if (mode === "week" || mode === "month")
      eventsQuery.gte("event_date", historyFrom.toISOString().slice(0, 10));
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
    const [s, c, t, e, h] = await Promise.all([
      db.from("schedules").select("*").order("sort_order").order("created_at"),
      needed.has("categories")
        ? db.from("categories").select("*").order("sort_order")
        : empty,
      needed.has("tasks")
        ? db.from("tasks").select("*").order("sort_order").order("created_at")
        : empty,
      needed.has("events") ? eventsQuery : empty,
      needed.has("completions") ? completionsQuery : empty,
    ]);
    const firstError = [s.error, c.error, t.error, e.error, h.error].find(
      Boolean,
    );
    if (firstError) {
      const queryCache = loadCachedWorkspace(user.id, mode);
      if (queryCache) {
        setData(queryCache);
        setLoading(false);
        return;
      }
      setError(firstError.message);
      setLoading(false);
      return;
    }
    let completions = h.data ?? [];
    if (mode === "today") {
      const onceTaskIds = (t.data ?? [])
        .filter((task) => task.recurrence_type === "once")
        .map((task) => task.id);
      for (let offset = 0; offset < onceTaskIds.length; offset += 100) {
        const { data: onceCompletions, error: onceError } = await db
          .from("task_completions")
          .select("*")
          .in("task_id", onceTaskIds.slice(offset, offset + 100));
        if (onceError) {
          setError(onceError.message);
          setLoading(false);
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
    };
    setData(workspace);
    cacheWorkspace(mode, workspace);
    setLoading(false);
  }, [db, mode]);
  useEffect(() => {
    queueMicrotask(() => void load());
    const synced = () => void load();
    window.addEventListener("planora-sync-complete", synced);
    return () => window.removeEventListener("planora-sync-complete", synced);
  }, [load]);
  return { db, data, loading, error, reload: load, loadDate };
}
