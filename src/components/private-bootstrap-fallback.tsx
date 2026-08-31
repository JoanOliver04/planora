"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BOOTSTRAP_WATCHDOG_MS } from "@/lib/bootstrap/timeout";
import { BootstrapRecovery } from "@/components/bootstrap-recovery";

export function PrivateBootstrapFallback({
  locale,
  watchdogMs = BOOTSTRAP_WATCHDOG_MS,
}: {
  locale: string;
  watchdogMs?: number;
}) {
  const t = useTranslations("Errors.bootstrap");
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setStuck(true), watchdogMs);
    return () => window.clearTimeout(timer);
  }, [watchdogMs]);
  if (stuck)
    return (
      <BootstrapRecovery
        locale={locale}
        code={
          typeof navigator !== "undefined" && !navigator.onLine
            ? "offline"
            : "timeout"
        }
        phase={
          typeof navigator !== "undefined" && !navigator.onLine
            ? "offline"
            : "recoverable_error"
        }
      />
    );
  return (
    <div
      className="bootstrap-screen"
      aria-busy="true"
      aria-live="polite"
      aria-label={t("loading")}
    >
      {/* Native img so a missing next/image chunk cannot pin this fallback. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assets/logo.webp" width={72} height={72} alt="" />
      <p className="muted">{t("loading")}</p>
    </div>
  );
}
