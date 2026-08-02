create or replace function public.delete_schedule(target_schedule_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  replacement_id uuid;
  task_count integer;
  event_count integer;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform 1 from public.schedules
    where id = target_schedule_id and user_id = current_user_id
    for update;
  if not found then raise exception 'Schedule not found'; end if;

  select count(*) into task_count from public.tasks
    where schedule_id = target_schedule_id and user_id = current_user_id;
  select count(*) into event_count from public.events
    where schedule_id = target_schedule_id and user_id = current_user_id;
  if task_count > 0 or event_count > 0 then
    raise exception 'Schedule is not empty';
  end if;

  select id into replacement_id from public.schedules
    where user_id = current_user_id and id <> target_schedule_id and not is_archived
    order by sort_order, created_at, id limit 1;
  update public.profiles
    set active_schedule_id = case
      when active_schedule_id = target_schedule_id then replacement_id
      else active_schedule_id
    end
    where id = current_user_id;
  delete from public.schedules
    where id = target_schedule_id and user_id = current_user_id;
  return replacement_id;
end
$$;

revoke all on function public.delete_schedule(uuid) from public;
grant execute on function public.delete_schedule(uuid) to authenticated;
