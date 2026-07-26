# Planora

Planora is a bilingual, mobile-first task, habit, schedule and event manager built with Next.js 16, React 19, TypeScript, Supabase and Tailwind CSS.

## Local setup

1. Install Node.js 20+ and run `npm install`.
2. Create a Supabase project and copy `.env.example` to `.env.local`.
3. Put the project URL and publishable key in `.env.local`. Keep the service-role key server-only.
4. In Supabase SQL Editor, apply every SQL file in `supabase/migrations` in filename order.
5. In Authentication → Providers, enable Google and disable Email, Phone and all unused providers.
6. In Google Cloud Console create an OAuth web client. Add the Supabase callback `https://PROJECT.supabase.co/auth/v1/callback` and set the client ID/secret in Supabase.
7. Add `http://localhost:3000/auth/callback` and the production equivalent to Supabase Authentication → URL Configuration redirect allow-list.
8. Run `npm run dev` and open `http://localhost:3000`.

Google OAuth requests only `openid email profile`. No password or magic-link UI exists.

## Commands

- `npm run dev` — development
- `npm run lint` — ESLint
- `npm run typecheck` — strict TypeScript
- `npm test` — Vitest
- `npm run test:coverage` — coverage
- `npm run test:e2e` — Playwright
- `npm run build && npm start` — production
- `npm run db:types` — regenerate Supabase types (requires Supabase CLI)

## Deploy to Vercel

Import this repository in Vercel, add the same environment variables, set `NEXT_PUBLIC_SITE_URL` to the public HTTPS URL, and deploy. Update Supabase and Google redirect URLs with the production domains. See [deployment](docs/deployment.md), [security](docs/security.md), and [database](docs/database.md).

Supabase and Vercel free tiers can pause or throttle idle projects. Recurrence is calculated on request and needs no cron. The architecture can scale through indexed range queries, pagination and a higher Supabase plan without an ORM rewrite.
