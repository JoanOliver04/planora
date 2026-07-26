"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { WorkspaceData } from "./types";
import { localWeek } from "@/lib/dates/timezone";
export function useWorkspace() {
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
    const week = localWeek(
      profile.timezone,
      new Date(),
      profile.week_starts_on === 0 ? 0 : 1,
    );
    const from = new Date(`${week.start}T00:00:00`);
    from.setDate(from.getDate() - 90);
    const [s, c, t, e, h] = await Promise.all([
      db.from("schedules").select("*").order("created_at"),
      db.from("categories").select("*").order("sort_order"),
      db.from("tasks").select("*").order("sort_order").order("created_at"),
      db
        .from("events")
        .select("*")
        .gte("event_date", from.toISOString().slice(0, 10))
        .order("event_date"),
      db
        .from("task_completions")
        .select("*")
        .gte("occurrence_date", from.toISOString().slice(0, 10))
        .order("completed_at", { ascending: false }),
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
  }, [db]);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  return { db, data, loading, error, reload: load };
}
