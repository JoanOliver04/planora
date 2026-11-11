import { AuthLink } from "./auth-link";

export function LegalBackLink({
  locale,
  from,
}: {
  locale: string;
  from?: string | string[];
}) {
  const destination =
    from === "settings"
      ? "/settings"
      : from === "demo-settings"
        ? "/demo/settings"
        : "";

  // Returning from a public document must install the private page's nonce CSP.
  return <AuthLink href={`/${locale}${destination}`}>← Planora</AuthLink>;
}
