# Implementation plan

1. Establish strict Next.js, bilingual routing, design tokens and PWA metadata.
2. Model ownership-safe Supabase tables, recurrence JSON, immutable completion snapshots and RLS.
3. Implement Google OAuth SSR sessions and route protection.
4. Build schedules, categories, task/event management, recurrence, completion history and statistics.
5. Polish mobile Today, responsive Week, settings, themes and accessibility.
6. Verify with lint, type checking, Vitest, Playwright and production build.

Assumptions: weeks follow the user's week_starts_on (Sunday or Monday); Europe/Madrid fallback; intervals preserve their local anchor; monthly intervals clamp to the last day; cross-midnight task ranges are rejected in MVP; events are one-time; tasks with history archive instead of hard-delete.
