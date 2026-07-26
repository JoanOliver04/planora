# Database

The migrations define profiles, schedules, categories, tasks, completions and events. Composite foreign keys `(resource_id, user_id)` prevent cross-account schedule/category/task references. UUIDs, constraints, partial indexes, immutable JSON completion snapshots and automatic `updated_at` triggers are included. A completion guard enforces date bounds, selected weekdays, one-time dates, archive dates, and weekly targets. Apply migrations with the Supabase CLI (`supabase db push`) or SQL Editor. Regenerate TypeScript with `npm run db:types`.
