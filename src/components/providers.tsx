"use client";
import { ThemeProvider } from "@/components/theme-provider";
import { useEffect } from "react";
import { PublicConnectivityStatus } from "@/components/public-connectivity-status";
import { scheduleServiceWorkerRegistration } from "@/lib/pwa/register-sw";

export function Providers({
  children,
  locale,
}: {
  children: React.ReactNode;
  locale: string;
}) {
  useEffect(() => {
    document.documentElement.lang = locale;
    return scheduleServiceWorkerRegistration();
  }, [locale]);

  return (
    <ThemeProvider>
      <PublicConnectivityStatus locale={locale} />
      {children}
    </ThemeProvider>
  );
}
