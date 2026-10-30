# Deployment checklist

- Create Supabase project and apply all migrations.
- Enable Google; disable Email, Phone and unused providers.
- Configure Google consent screen and web OAuth credentials.
- Add Supabase callback to Google authorised redirect URIs.
- Add local and production app callbacks to Supabase redirect allow-list.
- Import GitHub repository into Vercel.
- Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`, and server-only `SUPABASE_SERVICE_ROLE_KEY`.
- Run lint, typecheck, tests and build.
- Verify login, logout, RLS with two test users, mobile layout and account deletion before launch.

## Security rollout (2026-10-30)

1. Test all migrations against an isolated PostgreSQL instance with `powershell -NoProfile -File scripts/test-security-db.ps1` (Docker and the documented cached Supabase PostgreSQL image are required).
2. Review current per-user counts and oversized JSON before introducing quotas; existing data is not deleted. New CHECKs are `NOT VALID`, so validate legacy rows separately before marking them validated.
3. Temporarily suspend restore use during the coordinated rollout. Apply `20261030165630_restrict_auth_bootstrap_rpc.sql`, `20261030170000_restore_attempt_accounting.sql`, `20261030171000_database_resource_bounds.sql` and `20261030172000_security_lock_order.sql` before releasing the application that requires an explicit restore `ok` result. Old/new restore clients must not be mixed during this window. The bootstrap migration removes direct client execution of the existing trigger function without modifying profile or task rows.
4. Deploy the updated lockfile and application, then smoke-test Google sign-in, fresh and stale-session deletion, successful and failing restore, cross-tab sign-out, and two-user isolation in staging.
5. Configure HTTPS, exact Google/Supabase callback allowlists, Google-only providers and refresh-token rotation in the **hosted** project. `supabase/config.toml` is local development/test configuration and does not prove these production settings.
6. At the hosting/gateway layer, enforce request, connection, body-size and execution-time limits for both Next.js and Supabase/PostgREST. SQL counters cannot persist across a connection abort or transaction cancellation. Trust forwarded client-IP headers only when the ingress overwrites them.
7. Limit access and retention for operational logs, review Supabase security advisors, backups and recovery procedures, and keep service-role credentials server-only. Require strong MFA for operator Google, Supabase, Vercel and GitHub accounts.

`npm run test:security:e2e` starts a separate loopback server with placeholder credentials. Privileged E2E files refuse non-loopback Supabase URLs; never disable that guard to test production.
