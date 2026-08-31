-- Close direct restore_core execution and rate-limit restores in SQL
-- so REST callers cannot skip the app limiter.

revoke all on function public.restore_planora_backup_core(jsonb)
  from public, anon, authenticated;
grant execute on function public.restore_planora_backup_core(jsonb)
  to service_role;

create or replace function public.assert_restore_rate_limit()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed boolean;
  key_hash text;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;
  key_hash := encode(
    extensions.digest('backup-restore:' || auth.uid()::text, 'sha256'),
    'hex'
  );
  select result.allowed
    into allowed
  from public.consume_rate_limit(key_hash, 5, 3600) as result;
  if not coalesce(allowed, false) then
    raise exception 'Too many restore attempts';
  end if;
end;
$$;

revoke all on function public.assert_restore_rate_limit()
  from public, anon, authenticated;
grant execute on function public.assert_restore_rate_limit() to authenticated;

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

revoke all on function public.restore_planora_backup(jsonb) from public, anon;
grant execute on function public.restore_planora_backup(jsonb) to authenticated;
