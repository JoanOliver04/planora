"use client";
import { ThemeProvider } from "@/components/theme-provider";
import { NextIntlClientProvider } from "next-intl";
import { Toaster } from "sonner";
import { useEffect } from "react";
import { PublicConnectivityStatus } from "@/components/public-connectivity-status";
import { registerPlanoraServiceWorker } from "@/lib/pwa/register-sw";

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
    void registerPlanoraServiceWorker();
  }, [locale]);

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      timeZone="Europe/Madrid"
    >
      <ThemeProvider>
        <Toaster
          richColors
          position="top-center"
          offset={{ top: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
          mobileOffset={{
            top: "calc(0.75rem + env(safe-area-inset-top, 0px))",
            left: "max(0.75rem, env(safe-area-inset-left, 0px))",
            right: "max(0.75rem, env(safe-area-inset-right, 0px))",
          }}
        />
        <PublicConnectivityStatus locale={locale} />
        {children}
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
