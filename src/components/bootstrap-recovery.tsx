"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { logBootstrap } from "@/lib/bootstrap/log";
import type { BootstrapPhase } from "@/lib/bootstrap/phase";

export function BootstrapRecovery({
  locale,
  phase = "recoverable_error",
  code = "generic",
  onRetry,
}: {
  locale: string;
  phase?: BootstrapPhase;
  code?: string;
  onRetry?: () => void;
}) {
  const t = useTranslations("Errors.bootstrap");
  const offline = phase === "offline" || code === "offline";
  useEffect(() => {
    logBootstrap({
      phase,
      errorType: code,
      code,
      online: typeof navigator === "undefined" ? undefined : navigator.onLine,
    });
  }, [phase, code]);

  const detail =
    code === "timeout"
      ? t("timeout")
      : code === "auth"
        ? t("auth")
        : code === "assets" || code === "chunk_or_css_404"
          ? t("assets")
          : offline
            ? t("offline")
            : t("generic");

  return (
    <main className="login">
      <section
        className="surface empty bootstrap-recovery"
        data-locale={locale}
        role="alert"
      >
        {/* Native img so a missing next/image chunk cannot pin recovery. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/logo.webp" width={72} height={72} alt="" />
        <h1>{t("title")}</h1>
        <p className="muted">{t("body")}</p>
        <p className="muted">{detail}</p>
        <div className="bootstrap-actions">
          <button
            className="primary"
            type="button"
            onClick={() => (onRetry ? onRetry() : location.reload())}
          >
            {t("retry")}
          </button>
          <button
            className="pill"
            type="button"
            onClick={() => location.reload()}
          >
            {t("reload")}
          </button>
        </div>
      </section>
    </main>
  );
}
