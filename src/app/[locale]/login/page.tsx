import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Logo } from "@/components/navigation";
import { GoogleButton } from "@/features/auth/google-button";
import { Languages, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
export default async function Login({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (isSupabaseConfigured()) {
    const db = await createClient(),
      {
        data: { user },
      } = await db.auth.getUser();
    if (user) redirect(`/${locale}/today`);
  }
  const t = await getTranslations("Auth");
  return (
    <main className="login">
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
          <p className="muted">{t("subtitle")}</p>
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
  );
}
