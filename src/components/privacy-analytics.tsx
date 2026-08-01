"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
const key = "planora-analytics-consent";
export function PrivacyAnalytics({ locale }: { locale: string }) {
  const path = usePathname(), [consent, setConsent] = useState<string | null>(null);
  useEffect(() => { const value = localStorage.getItem(key); queueMicrotask(() => setConsent(value)); }, []);
  useEffect(() => { if (consent !== "yes" || navigator.doNotTrack === "1") return; void fetch("/api/telemetry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "pageview", path }) }); }, [consent, path]);
  if (consent) return null;
  const save = (value: "yes" | "no") => { localStorage.setItem(key, value); setConsent(value); };
  return <aside className="consent-banner" aria-label={locale === "es" ? "Preferencias de analítica" : "Analytics preferences"}><p>{locale === "es" ? "¿Permites métricas anónimas de uso? Sin cookies, publicidad ni datos personales." : "Allow anonymous usage metrics? No cookies, advertising, or personal data."}</p><div className="button-row"><button onClick={() => save("yes")}>{locale === "es" ? "Permitir" : "Allow"}</button><button className="secondary" onClick={() => save("no")}>{locale === "es" ? "No, gracias" : "No thanks"}</button></div></aside>;
}
