"use client";
import { createClient } from "@/lib/supabase/client";
import { useLocale, useTranslations } from "next-intl";
import { CircleUser } from "lucide-react";
import { toast } from "sonner";
export function GoogleButton() {
  const t = useTranslations("Auth"),
    locale = useLocale();
  async function login() {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      toast.error("Supabase is not configured");
      return;
    }
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=/${locale}/today`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, scopes: "openid email profile" },
    });
    if (error) toast.error(error.message);
  }
  return (
    <button className="google" onClick={login}>
      <CircleUser size={20} />
      {t("google")}
    </button>
  );
}
