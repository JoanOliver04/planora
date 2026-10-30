import type { ReactNode } from "react";

/** A new document installs the private nonce CSP when leaving public pages. */
export function AuthLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  // Client routing retains the public document's CSP. This intentionally uses
  // document navigation, including when opening a login link in a new tab.
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
