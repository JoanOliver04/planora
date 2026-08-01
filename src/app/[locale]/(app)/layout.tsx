import { AppShell } from "@/components/app-shell";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { GuidedOnboarding } from "@/features/onboarding/onboarding";
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
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed")
    .eq("id", user.id)
    .single();
  return (
    <>
      {!profile?.onboarding_completed && (
        <GuidedOnboarding locale={locale as "es" | "en"} />
      )}
      <AppShell locale={locale as "es" | "en"}>{children}</AppShell>
    </>
  );
}
