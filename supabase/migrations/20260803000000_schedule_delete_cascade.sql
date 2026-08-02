create or replace function public.delete_schedule(target_schedule_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  replacement_id uuid;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;

  perform 1 from public.schedules
    where id = target_schedule_id and user_id = current_user_id
    for update;
  if not found then raise exception 'Schedule not found'; end if;

  select id into replacement_id
    from public.schedules
    where user_id = current_user_id
      and id <> target_schedule_id
      and not is_archived
    order by sort_order, created_at, id
    limit 1;

  -- Delete dependants explicitly because task history and schedule links use RESTRICT.
  -- All statements run in this function transaction; any failure rolls everything back.
  delete from public.task_completions
    where user_id = current_user_id
      and task_id in (select id from public.tasks where schedule_id = target_schedule_id and user_id = current_user_id);
  delete from public.tasks
    where schedule_id = target_schedule_id and user_id = current_user_id;
  delete from public.events
    where schedule_id = target_schedule_id and user_id = current_user_id;

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
