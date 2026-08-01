"use client";
import { ThemeProvider } from "@/components/theme-provider";
import { NextIntlClientProvider } from "next-intl";
import { Toaster } from "sonner";
import { useEffect } from "react";
import { OfflineStatus } from "@/components/offline-status";
import { ReminderScheduler } from "@/components/reminder-scheduler";
import { PrivacyAnalytics } from "@/components/privacy-analytics";
export function Providers({
  children,
  locale,
  messages,
}: {
  children: React.ReactNode;
  locale: string;
  messages: Record<string, unknown>;
}) {
  useEffect(() => {
    document.documentElement.lang = locale;
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js", { scope: "/" });
  }, [locale]);

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      timeZone="Europe/Madrid"
    >
      <ThemeProvider>
        <Toaster richColors position="top-center" />
        <OfflineStatus locale={locale} />
        <ReminderScheduler locale={locale} />
        <PrivacyAnalytics locale={locale} />
        {children}
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
