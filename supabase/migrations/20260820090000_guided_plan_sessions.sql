-- Guided plan sessions and optional task recommendation.
-- Expand-only: existing rows are unchanged and the nullable relationship is
-- ownership-safe. The deferred FK keeps atomic backup restore ordering valid.

alter table public.focus_presets
  drop constraint focus_presets_mode_check;
alter table public.focus_presets
  add constraint focus_presets_mode_check
  check (mode in ('countdown', 'stopwatch', 'cycles', 'structured_plan'));

alter table public.focus_sessions
  drop constraint focus_sessions_mode_check;
alter table public.focus_sessions
  add constraint focus_sessions_mode_check
  check (mode in ('countdown', 'stopwatch', 'cycles', 'structured_plan'));

alter table public.focus_presets
  drop constraint focus_presets_mode_duration_valid;
alter table public.focus_presets
  add constraint focus_presets_mode_duration_valid check (
    mode in ('stopwatch', 'structured_plan')
    or (mode in ('countdown', 'cycles') and focus_duration_sec is not null)
  );

alter table public.tasks
  add column recommended_focus_preset_id uuid;

alter table public.tasks
  add constraint tasks_recommended_focus_preset_owner_fk
  foreign key (recommended_focus_preset_id, user_id)
  references public.focus_presets (id, user_id)
  on delete set null (recommended_focus_preset_id)
  deferrable initially deferred;

comment on column public.tasks.recommended_focus_preset_id is
  'Optional user-owned Focus preset suggested when Focus starts from this task.';

create index tasks_recommended_focus_preset_idx
  on public.tasks (user_id, recommended_focus_preset_id)
  where recommended_focus_preset_id is not null;

-- Keep v5 task recommendations inside the same restore transaction. The core
-- restores presets and tasks; this wrapper then reconnects sanitized UUIDs.
create or replace function public.restore_planora_backup(backup_data jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  restored jsonb;
  current_user_id uuid := auth.uid();
begin
  perform set_config('planora.restoring', 'on', true);
  delete from public.task_occurrence_state where user_id = current_user_id;
  restored := public.restore_planora_backup_core(backup_data);

  perform public.restore_category_scope(
    coalesce(backup_data->'categories', '[]'::jsonb), current_user_id
  );

  update public.tasks as task
  set
    focus_enabled = coalesce(source.focus_enabled, false),
    recommended_focus_preset_id = case
      when coalesce(source.focus_enabled, false) then source.recommended_focus_preset_id
      else null
    end
  from jsonb_to_recordset(coalesce(backup_data->'tasks', '[]'::jsonb))
    as source(id uuid, focus_enabled boolean, recommended_focus_preset_id uuid)
  where task.id = source.id and task.user_id = current_user_id;

  update public.focus_sessions set
    status = 'cancelled', ended_at = coalesce(ended_at, started_at),
    current_phase_kind = null
  where user_id = current_user_id
    and status in ('running', 'paused', 'on_break');

  update public.focus_intervals
  set ended_at = coalesce(ended_at, started_at)
  where user_id = current_user_id and ended_at is null;

  return restored;
end
$$;

revoke all on function public.restore_planora_backup(jsonb) from public;
grant execute on function public.restore_planora_backup(jsonb) to authenticated;
