import { AppShell } from "@/components/app-shell";
import { BootstrapRecovery } from "@/components/bootstrap-recovery";
import { GuidedOnboarding } from "@/features/onboarding/onboarding";
import { mapSessionRow } from "@/features/focus/mappers";
import type { FocusSession } from "@/features/focus/types";
import { ReminderScheduler } from "@/components/reminder-scheduler";
import { OfflineStatus } from "@/components/offline-status";
import { PrivateIntlProvider } from "@/components/private-intl-provider";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { logBootstrap } from "@/lib/bootstrap/log";
import {
  AUTH_TIMEOUT_MS,
  QUERY_TIMEOUT_MS,
  TimeoutError,
  isTimeoutError,
  withTimeout,
} from "@/lib/bootstrap/timeout";
import { redirect } from "next/navigation";

export async function PrivateSession({
  children,
  locale,
}: {
  children: React.ReactNode;
  locale: string;
}) {
  if (!isSupabaseConfigured()) redirect(`/${locale}/login?error=config`);
  const supabase = await createClient();
  let user: { id: string } | null = null;
  try {
    const {
      data: { user: sessionUser },
    } = await withTimeout(supabase.auth.getUser(), AUTH_TIMEOUT_MS);
    user = sessionUser;
  } catch (error) {
    logBootstrap({
      phase: "auth",
      errorType: isTimeoutError(error) ? "timeout" : "auth_error",
      code: error instanceof TimeoutError ? "timeout" : "auth",
    });
    return (
      <BootstrapRecovery
        locale={locale}
        code={isTimeoutError(error) ? "timeout" : "auth"}
        phase="recoverable_error"
      />
    );
  }
  if (!user) redirect(`/${locale}/login`);

  let timezone = "Europe/Madrid";
  let onboardingCompleted = true;
  try {
    const { data: profile } = await withTimeout(
      supabase
        .from("profiles")
        .select("onboarding_completed,timezone")
        .eq("id", user.id)
        .single(),
      QUERY_TIMEOUT_MS,
    );
    timezone = profile?.timezone ?? timezone;
    onboardingCompleted = Boolean(profile?.onboarding_completed);
  } catch (error) {
    logBootstrap({
      phase: "auth",
      errorType: isTimeoutError(error) ? "timeout" : "profile_error",
      code: "profile",
    });
  }

  let initialFocusSession: FocusSession | null = null;
  try {
    const { data: activeRow } = await withTimeout(
      supabase
        .from("focus_sessions")
        .select(
          "id,user_id,status,mode,title,preset_id,task_id,category_id,schedule_id,occurrence_date,planned_focus_sec,focus_sec,paused_sec,break_sec,current_phase_kind,current_cycle,config,link_snapshot,started_at,ended_at,subjective_focus,subjective_energy,complete_task_on_end,task_completion_applied,revision,created_at,updated_at",
        )
        .eq("user_id", user.id)
        .in("status", ["running", "paused", "on_break"])
        .maybeSingle(),
      QUERY_TIMEOUT_MS,
    );
    if (activeRow) {
      const { data: intervals } = await withTimeout(
        supabase
          .from("focus_intervals")
          .select(
            "id,user_id,session_id,kind,sequence,cycle_index,started_at,ended_at,planned_duration_sec,created_at",
          )
          .eq("user_id", user.id)
          .eq("session_id", activeRow.id)
          .order("sequence", { ascending: true }),
        QUERY_TIMEOUT_MS,
      );
      initialFocusSession = mapSessionRow(
        {
          ...activeRow,
          notes: null,
          distractions: [],
        },
        intervals ?? [],
      );
    }
  } catch {
    initialFocusSession = null;
  }

  return (
    <PrivateIntlProvider locale={locale} timeZone={timezone}>
      <OfflineStatus locale={locale} />
      <ReminderScheduler locale={locale} />
      {!onboardingCompleted && (
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
