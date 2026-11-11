import { getMessages, getTranslations } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { redirect } from "next/navigation";
import { Logo } from "@/components/navigation";
import { GoogleButton } from "@/features/auth/google-button";
import { Languages, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { AUTH_TIMEOUT_MS, withTimeout } from "@/lib/bootstrap/timeout";
import { NotificationToaster } from "@/components/notification-toaster";
import { StudioCredit } from "@/components/studio-credit";
export default async function Login({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { locale } = await params;
  const { error } = await searchParams;
  let signedIn = false;
  if (isSupabaseConfigured()) {
    try {
      const db = await createClient();
      const {
        data: { session },
      } = await withTimeout(db.auth.getSession(), AUTH_TIMEOUT_MS);
      signedIn = Boolean(session?.user);
    } catch {
      // Fail open to the login form so a hung auth call cannot pin the splash.
    }
  }
  if (signedIn) redirect(`/${locale}/today`);
  const t = await getTranslations("Auth");
  const messages = await getMessages();
  return (
    <NextIntlClientProvider
      locale={locale}
      timeZone="Europe/Madrid"
      messages={{
        Auth: messages.Auth,
        Common: messages.Common,
        Errors: messages.Errors,
        Nav: messages.Nav,
      }}
    >
      <main className="login">
        <NotificationToaster />
        <div className="login-card surface">
          <section className="login-copy">
            <Logo variant="login" />
            <div style={{ marginTop: "auto", paddingTop: "8rem" }}>
              <Sparkles size={30} />
              <h1
                className="title"
                style={{ fontSize: "clamp(2.6rem,6vw,4.5rem)", maxWidth: 520 }}
              >
                {t("title")}
              </h1>
              <p style={{ fontSize: "1.15rem", opacity: 0.78, maxWidth: 430 }}>
                {t("subtitle")}
              </p>
            </div>
          </section>
          <section className="login-form">
            <h2>Planora</h2>
            <StudioCredit locale={locale} />
            <p className="muted">{t("subtitle")}</p>
            {error === "oauth" ? (
              <p className="auth-error" role="alert">
                {t("oauthError")}
              </p>
            ) : null}
            <GoogleButton />
            <Link className="pill demo-entry" href={`/${locale}/demo/today`}>
              <Sparkles size={18} />
              {t("demo")}
            </Link>
            <p className="muted demo-entry-hint">{t("demoHint")}</p>
            <p
              className="muted"
              style={{ fontSize: 12, display: "flex", gap: 8 }}
            >
              <ShieldCheck size={28} />
              {t("privacy")}
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <Languages size={18} />
              <Link href={locale === "es" ? "/en/login" : "/es/login"}>
                {locale === "es" ? "English" : "Español"}
              </Link>
            </div>
          </section>
        </div>
      </main>
    </NextIntlClientProvider>
  );
}
