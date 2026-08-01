"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { WorkspaceData } from "./types";
import type { WorkspaceMode } from "./types";
import { localDate, localWeek } from "@/lib/dates/timezone";

const requirements: Record<
  WorkspaceMode,
  ReadonlySet<"categories" | "tasks" | "events" | "completions">
> = {
  today: new Set(["categories", "tasks", "events", "completions"]),
  week: new Set(["categories", "tasks", "events"]),
  tasks: new Set(["categories", "tasks"]),
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
  const load = useCallback(async () => {
    setError(null);
    const {
      data: { user },
      error: authError,
    } = await db.auth.getUser();
    if (authError || !user) {
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
    const historyFrom = new Date(`${week.start}T00:00:00`);
    historyFrom.setDate(historyFrom.getDate() - 90);
    const needed = requirements[mode];
    const empty = Promise.resolve({ data: [], error: null });
    const eventsQuery = db.from("events").select("*").order("event_date");
    if (mode === "today") eventsQuery.eq("event_date", today);
    else if (mode === "week")
      eventsQuery.gte("event_date", historyFrom.toISOString().slice(0, 10));
    const [s, c, t, e, h] = await Promise.all([
      db
        .from("schedules")
        .select("*")
        .order("sort_order")
        .order("created_at"),
      needed.has("categories")
        ? db.from("categories").select("*").order("sort_order")
        : empty,
      needed.has("tasks")
        ? db.from("tasks").select("*").order("sort_order").order("created_at")
        : empty,
      needed.has("events") ? eventsQuery : empty,
      needed.has("completions")
        ? db
            .from("task_completions")
            .select("*")
            .gte(
              "occurrence_date",
              mode === "today"
                ? week.start
                : historyFrom.toISOString().slice(0, 10),
            )
            .order("completed_at", { ascending: false })
        : empty,
    ]);
    const firstError = [s.error, c.error, t.error, e.error, h.error].find(
      Boolean,
    );
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }
    setData({
      user: {
        id: user.id,
        email: user.email,
      },
      profile,
      schedules: s.data ?? [],
      categories: c.data ?? [],
      tasks: t.data ?? [],
      events: e.data ?? [],
      completions: h.data ?? [],
    });
    setLoading(false);
  }, [db, mode]);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  return { db, data, loading, error, reload: load };
}
