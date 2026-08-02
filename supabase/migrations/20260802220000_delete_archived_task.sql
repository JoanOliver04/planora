create or replace function public.delete_archived_task(target_task_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform 1
  from public.tasks
  where id = target_task_id
    and user_id = current_user_id
    and archived_at is not null
  for update;

  if not found then
    return false;
  end if;

  delete from public.task_completions
  where task_id = target_task_id
    and user_id = current_user_id;

  delete from public.tasks
  where id = target_task_id
    and user_id = current_user_id
    and archived_at is not null;

  return found;
end;
$$;

revoke all on function public.delete_archived_task(uuid) from public;
revoke all on function public.delete_archived_task(uuid) from anon;
grant execute on function public.delete_archived_task(uuid) to authenticated;