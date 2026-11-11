"use client";
import { ThemeProvider } from "@/components/theme-provider";
import { useEffect } from "react";
import { PublicConnectivityStatus } from "@/components/public-connectivity-status";
import { registerPlanoraServiceWorker } from "@/lib/pwa/register-sw";

export function Providers({
  children,
  locale,
}: {
  children: React.ReactNode;
  locale: string;
}) {
  useEffect(() => {
    document.documentElement.lang = locale;
    // Shell precaching downloads several brand assets. Let first paint and
    // hydration finish before competing with the hero image on mobile networks.
    const timer = window.setTimeout(() => {
      void registerPlanoraServiceWorker();
    }, 2_500);
    return () => window.clearTimeout(timer);
  }, [locale]);

  return (
    <ThemeProvider>
      <PublicConnectivityStatus locale={locale} />
      {children}
    </ThemeProvider>
  );
}
