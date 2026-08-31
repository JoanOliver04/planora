import { AppShell } from "@/components/app-shell";
import { BootstrapRecovery } from "@/components/bootstrap-recovery";
import { GuidedOnboarding } from "@/features/onboarding/onboarding";
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

  return (
    <PrivateIntlProvider locale={locale} timeZone={timezone}>
      <OfflineStatus locale={locale} />
      <ReminderScheduler locale={locale} />
      {!onboardingCompleted && (
        <GuidedOnboarding locale={locale as "es" | "en"} />
      )}
      <AppShell locale={locale as "es" | "en"}>{children}</AppShell>
    </PrivateIntlProvider>
  );
}
