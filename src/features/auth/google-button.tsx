"use client";
import { createClient } from "@/lib/supabase/client";
import { useLocale, useTranslations } from "next-intl";
import { CircleUser, LoaderCircle } from "lucide-react";
import { useId, useRef, useState } from "react";
export function GoogleButton() {
  const t = useTranslations("Auth"),
    locale = useLocale(),
    [pending, setPending] = useState(false),
    [error, setError] = useState<string | null>(null),
    inFlight = useRef(false),
    errorId = useId();
  async function login() {
    if (inFlight.current) return;
    setError(null);
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setError(t("unavailable"));
      return;
    }
    inFlight.current = true;
    setPending(true);
    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=/${locale}/today`;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, scopes: "openid email" },
      });
      if (error || !data.url) throw new Error("oauth_unavailable");
    } catch {
      inFlight.current = false;
      setPending(false);
      setError(t("signInError"));
    }
  }
  return (
    <div className="google-sign-in">
      <button
        className="google"
        type="button"
        disabled={pending}
        aria-busy={pending}
        aria-describedby={error ? errorId : undefined}
        onClick={() => void login()}
      >
        {pending ? (
          <LoaderCircle size={20} aria-hidden="true" />
        ) : (
          <CircleUser size={20} aria-hidden="true" />
        )}
        {t(pending ? "connecting" : "google")}
      </button>
      {error ? (
        <p id={errorId} className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
