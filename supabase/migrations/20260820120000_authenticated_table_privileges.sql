-- Keep a fresh database equivalent to production. Row ownership remains
-- enforced by the RLS policies defined with each table.
grant usage on schema public to authenticated;

grant select, insert, update, delete on table
  public.profiles,
  public.schedules,
  public.categories,
  public.tasks,
  public.task_completions,
  public.events,
  public.schedule_templates,
  public.reminders,
  public.focus_presets,
  public.focus_sessions,
  public.focus_intervals,
  public.focus_goals
to authenticated;

grant select on table public.template_imports to authenticated;

grant select, insert, update on table public.task_occurrence_state
to authenticated;
