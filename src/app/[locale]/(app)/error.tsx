"use client";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { recoverClientError } from "@/lib/recover-client-error";
export default function ErrorPage({
  error,
  reset,
  retry,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  retry?: () => void;
  unstable_retry?: () => void;
}) {
  const t = useTranslations("Errors");
  const recover = retry ?? unstable_retry ?? reset;
  useEffect(() => {
    void fetch("/api/telemetry", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "error",
        path: location.pathname,
        message: error.name,
        context: { digest: error.digest ?? null },
      }),
    });
  }, [error]);
  return (
    <div className="empty surface" role="alert">
      <h1>{t("generic")}</h1>
      <button
        className="primary"
        type="button"
        onClick={() => {
          recoverClientError();
          recover?.();
        }}
      >
        {t("bootstrap.retry")}
      </button>
    </div>
  );
}
