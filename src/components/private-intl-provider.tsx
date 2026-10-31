"use client";

import { NextIntlClientProvider } from "next-intl";
import { NotificationToaster } from "./notification-toaster";

export function PrivateIntlProvider({
  children,
  locale,
  timeZone,
  messages,
}: {
  children: React.ReactNode;
  locale: string;
  timeZone: string;
  messages: Record<string, unknown>;
}) {
  return (
    <NextIntlClientProvider
      locale={locale}
      timeZone={timeZone}
      messages={messages}
    >
      <NotificationToaster />
      {children}
    </NextIntlClientProvider>
  );
}
