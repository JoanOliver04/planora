-- The previous hardening revoked restore_core from authenticated so PostgREST
-- cannot call it. The wrapper stayed SECURITY INVOKER, so the inner call ran
-- as the session user and failed with 42501. Run the wrapper as DEFINER with
-- an empty search_path; ownership still comes only from auth.uid().

create or replace function public.restore_planora_backup(backup_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  restored jsonb;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Unauthorized';
  end if;
  if octet_length(coalesce(backup_data::text, '')) > 5242880 then
    raise exception 'backup too large';
  end if;
  perform public.assert_restore_rate_limit();
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

revoke all on function public.restore_planora_backup(jsonb)
  from public, anon;
grant execute on function public.restore_planora_backup(jsonb)
  to authenticated;

-- Keep restore internals out of PostgREST. The definer wrapper can still
-- call them because it runs as the function owner.
revoke all on function public.restore_planora_backup_core(jsonb)
  from public, anon, authenticated;
grant execute on function public.restore_planora_backup_core(jsonb)
  to service_role;

revoke all on function public.assert_restore_rate_limit()
  from public, anon, authenticated;

revoke all on function public.restore_category_scope(jsonb, uuid)
  from public, anon, authenticated;

-- Hide remaining user RPCs from anon/public. Authenticated keeps execute.
revoke all on function public.complete_onboarding(boolean, text)
  from public, anon;
grant execute on function public.complete_onboarding(boolean, text)
  to authenticated;

revoke all on function public.complete_guided_onboarding(text, text, text, integer, text, boolean)
  from public, anon;
grant execute on function public.complete_guided_onboarding(text, text, text, integer, text, boolean)
  to authenticated;

revoke all on function public.save_personal_template(uuid, text)
  from public, anon;
grant execute on function public.save_personal_template(uuid, text)
  to authenticated;

revoke all on function public.import_schedule_template(uuid, text, jsonb, boolean, boolean)
  from public, anon;
grant execute on function public.import_schedule_template(uuid, text, jsonb, boolean, boolean)
  to authenticated;

revoke all on function public.reorder_resources(text, uuid[])
  from public, anon;
grant execute on function public.reorder_resources(text, uuid[])
  to authenticated;

revoke all on function public.delete_schedule(uuid)
  from public, anon;
grant execute on function public.delete_schedule(uuid)
  to authenticated;
