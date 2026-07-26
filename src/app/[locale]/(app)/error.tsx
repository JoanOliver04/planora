"use client";
import { useTranslations } from "next-intl";
export default function ErrorPage({
  unstable_retry,
}: {
  error: Error;
  unstable_retry: () => void;
}) {
  const t = useTranslations("Errors");
  return (
    <div className="empty surface">
      <h1>{t("generic")}</h1>
      <button className="primary" onClick={() => unstable_retry()}>
        Retry
      </button>
    </div>
  );
}
