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
