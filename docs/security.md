# Security model

Every application table has RLS and explicit SELECT, INSERT, UPDATE and DELETE policies scoped to `auth.uid()`. Composite foreign keys prevent cross-user references even when identifiers are guessed. Google is the only UI authentication method and requests identity-only scopes. Sessions use Supabase SSR cookies; server layouts verify users. Redirects accept only same-origin relative paths. Text length and structural constraints exist in both Zod and PostgreSQL. User HTML is never rendered.

The publishable key is intentionally browser-safe; the service-role key must exist only in server environment variables and is reserved for verified account deletion. Operators must disable unused Supabase providers, keep dependencies patched, configure exact OAuth redirects, review CSP changes and rotate credentials if exposed. RLS must never be disabled in production.
