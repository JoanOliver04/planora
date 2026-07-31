# Security audit - 2026-07-31

Scope: Next.js application code, Supabase authentication and RLS migrations,
HTTP security headers, redirect handling, secret hygiene and npm dependencies.

## Remediated findings

- High: the OAuth callback allowed a backslash-prefixed path that URL
  normalization could turn into a cross-origin redirect.
- Medium: the CSP only restricted framing, objects and forms; it did not define
  default, script, style, image, font, connection, worker or media sources.
- Medium: the privileged new-user trigger used a mutable search path and trusted
  unbounded identity-provider metadata.
- Low: authentication and account-deletion responses were not explicitly marked
  non-cacheable.
- Low: the unauthenticated health endpoint disclosed the application version.

## Verified controls

Application tables have RLS policies scoped to auth.uid(), composite foreign
keys prevent cross-user relationships, mutations validate input and ownership,
the account deletion route requires a same-origin request and a confirmation
header, secrets are ignored by Git, and no unsafe HTML rendering or dynamic code
execution was found. npm audit reported zero known vulnerabilities.
