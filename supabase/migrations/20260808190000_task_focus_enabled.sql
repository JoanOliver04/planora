-- Focus is opt-in per task. Existing and restored legacy tasks stay disabled.
alter table public.tasks
  add column focus_enabled boolean not null default false;

create index tasks_focus_enabled_idx
  on public.tasks(user_id, sort_order)
  where focus_enabled and archived_at is null;

-- Preserve the flag during portable restores while keeping old backups valid.
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
  restored := public.restore_planora_backup_core(backup_data);

  perform public.restore_category_scope(
    coalesce(backup_data->'categories', '[]'::jsonb),
    current_user_id
  );

  update public.tasks as task
  set focus_enabled = coalesce(source.focus_enabled, false)
  from jsonb_to_recordset(coalesce(backup_data->'tasks', '[]'::jsonb))
    as source(id uuid, focus_enabled boolean)
  where task.id = source.id
    and task.user_id = current_user_id;

  return restored;
end
$$;

revoke all on function public.restore_planora_backup(jsonb) from public;
grant execute on function public.restore_planora_backup(jsonb) to authenticated;
