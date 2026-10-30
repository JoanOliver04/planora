-- Failed restores must consume the same budget as successful restores.
-- The outer statement commits attempt accounting; only workspace changes run
-- inside the exception subtransaction. Clients must inspect the returned ok flag.
create or replace function public.restore_planora_backup(backup_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  restored jsonb;
  current_user_id uuid := auth.uid();
  attempt_allowed boolean;
begin
  if current_user_id is null then
    raise exception 'Unauthorized';
  end if;

  -- A separate namespace avoids charging the Server Action's independent gate
  -- twice. This gate also covers authenticated callers using PostgREST directly.
  select result.allowed into attempt_allowed
  from public.consume_rate_limit(
    encode(extensions.digest('backup-restore-rpc:' || current_user_id::text, 'sha256'), 'hex'),
    5,
    3600
  ) as result;
  if not coalesce(attempt_allowed, false) then
    return jsonb_build_object('ok', false, 'error', 'RATE_LIMITED');
  end if;

  begin
    -- All workspace operations acquire the owner lock before any row locks.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(current_user_id::text, 7012026)
    );
    if backup_data is null or jsonb_typeof(backup_data) <> 'object'
      or octet_length(backup_data::text) > 5242880
    then
      raise exception 'Invalid backup';
    end if;

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

    -- Deferred ownership FKs must fail inside this savepoint, before accounting
    -- can commit. Otherwise an error at transaction commit would undo the gate.
    set constraints all immediate;
  exception when others then
    -- Never expose SQLERRM, row contents or constraint details to the caller.
    return jsonb_build_object('ok', false, 'error', 'INVALID_BACKUP');
  end;

  return restored || jsonb_build_object('ok', true);
end
$$;

revoke all on function public.restore_planora_backup(jsonb) from public, anon;
grant execute on function public.restore_planora_backup(jsonb) to authenticated;

revoke all on function public.restore_planora_backup_core(jsonb)
  from public, anon, authenticated;
grant execute on function public.restore_planora_backup_core(jsonb) to service_role;
revoke all on function public.restore_category_scope(jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.assert_restore_rate_limit()
  from public, anon, authenticated;
