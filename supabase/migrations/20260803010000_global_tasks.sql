-- Add explicit task scope while preserving existing schedule tasks.
alter table public.tasks alter column schedule_id drop not null;
alter table public.tasks add column if not exists scope text not null default 'schedule';
alter table public.tasks drop constraint if exists tasks_scope_valid;
alter table public.tasks add constraint tasks_scope_valid check (
  (scope = 'global' and schedule_id is null) or
  (scope = 'schedule' and schedule_id is not null)
);
