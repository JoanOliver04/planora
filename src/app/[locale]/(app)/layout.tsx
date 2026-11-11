import { Suspense } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { PrivateBootstrapFallback } from "@/components/private-bootstrap-fallback";
import { PrivateSession } from "@/components/private-session";

export default async function PrivateLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = await getMessages();
  return (
    <NextIntlClientProvider
      locale={locale}
      timeZone="Europe/Madrid"
      messages={{
        Auth: messages.Auth,
        Common: messages.Common,
        Errors: messages.Errors,
        Nav: messages.Nav,
      }}
    >
      <Suspense fallback={<PrivateBootstrapFallback locale={locale} />}>
        <PrivateSession locale={locale}>{children}</PrivateSession>
      </Suspense>
    </NextIntlClientProvider>
  );
}
