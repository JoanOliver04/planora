import { Suspense } from "react";
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
  return (
    <Suspense fallback={<PrivateBootstrapFallback locale={locale} />}>
      <PrivateSession locale={locale}>{children}</PrivateSession>
    </Suspense>
  );
}
