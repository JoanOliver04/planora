# Database

The initial migration defines profiles, schedules, categories, tasks, completions and events. Composite foreign keys `(resource_id, user_id)` prevent cross-account schedule/category/task references. UUIDs, constraints, partial indexes, immutable JSON completion snapshots and automatic `updated_at` triggers are included. Apply migrations with the Supabase CLI (`supabase db push`) or SQL Editor. Regenerate TypeScript with `npm run db:types`.
