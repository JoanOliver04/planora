import { AppShell } from "@/components/app-shell";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { GuidedOnboarding } from "@/features/onboarding/onboarding";
import { mapSessionRow } from "@/features/focus/mappers";
import type { FocusSession } from "@/features/focus/types";
import { ReminderScheduler } from "@/components/reminder-scheduler";
import { OfflineStatus } from "@/components/offline-status";
import { PrivateIntlProvider } from "@/components/private-intl-provider";

export default async function PrivateLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupabaseConfigured()) redirect(`/${locale}/login?error=config`);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);
  const profileQuery = supabase
    .from("profiles")
    .select("onboarding_completed,timezone")
    .eq("id", user.id)
    .single();

  // Runtime shell needs phase/timer fields only — keep private notes off every page payload.
  let initialFocusSession: FocusSession | null = null;
  const activeSessionQuery = supabase
    .from("focus_sessions")
    .select(
      "id,user_id,status,mode,title,preset_id,task_id,category_id,schedule_id,occurrence_date,planned_focus_sec,focus_sec,paused_sec,break_sec,current_phase_kind,current_cycle,config,link_snapshot,started_at,ended_at,subjective_focus,subjective_energy,complete_task_on_end,task_completion_applied,revision,created_at,updated_at",
    )
    .eq("user_id", user.id)
    .in("status", ["running", "paused", "on_break"])
    .maybeSingle();
  const [{ data: profile }, { data: activeRow }] = await Promise.all([
    profileQuery,
    activeSessionQuery,
  ]);
  if (activeRow) {
    const { data: intervals } = await supabase
      .from("focus_intervals")
      .select(
        "id,user_id,session_id,kind,sequence,cycle_index,started_at,ended_at,planned_duration_sec,created_at",
      )
      .eq("user_id", user.id)
      .eq("session_id", activeRow.id)
      .order("sequence", { ascending: true });
    initialFocusSession = mapSessionRow(
      {
        ...activeRow,
        notes: null,
        distractions: [],
      },
      intervals ?? [],
    );
  }

  return (
    <PrivateIntlProvider
      locale={locale}
      timeZone={profile?.timezone ?? "Europe/Madrid"}
    >
      <OfflineStatus locale={locale} />
      <ReminderScheduler locale={locale} />
      {!profile?.onboarding_completed && (
        <GuidedOnboarding locale={locale as "es" | "en"} />
      )}
      <AppShell
        locale={locale as "es" | "en"}
        initialFocusSession={initialFocusSession}
      >
        {children}
      </AppShell>
    </PrivateIntlProvider>
  );
}
