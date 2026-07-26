"use client";
import { ThemeProvider } from "@/components/theme-provider";
import { NextIntlClientProvider } from "next-intl";
import { Toaster } from "sonner";
import { useEffect } from "react";
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
  }, [locale]);

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      timeZone="Europe/Madrid"
    >
      <ThemeProvider>
        <Toaster richColors position="top-center" />
        {children}
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
