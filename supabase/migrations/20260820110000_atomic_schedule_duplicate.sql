-- Duplicate a schedule and its scoped resources in one transaction.
create or replace function public.duplicate_schedule(
  source_schedule_id uuid,
  include_tasks boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  source_schedule public.schedules%rowtype;
  source_category public.categories%rowtype;
  duplicated_schedule_id uuid;
  duplicated_category_id uuid;
  category_ids jsonb := '{}'::jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into source_schedule
  from public.schedules
  where id = source_schedule_id and user_id = current_user_id;
  if not found then raise exception 'Schedule not found'; end if;

  insert into public.schedules (user_id, name, description, emoji, sort_order)
  values (
    current_user_id,
    source_schedule.name || ' (copy)',
    source_schedule.description,
    source_schedule.emoji,
    source_schedule.sort_order
  )
  returning id into duplicated_schedule_id;

  if include_tasks then
    for source_category in
      select * from public.categories
      where user_id = current_user_id and schedule_id = source_schedule_id
      order by sort_order, created_at
    loop
      insert into public.categories (
        user_id, schedule_id, name, colour, emoji, sort_order
      ) values (
        current_user_id, duplicated_schedule_id, source_category.name,
        source_category.colour, source_category.emoji, source_category.sort_order
      ) returning id into duplicated_category_id;
      category_ids := category_ids || jsonb_build_object(
        source_category.id::text, duplicated_category_id
      );
    end loop;

    insert into public.tasks (
      user_id, schedule_id, scope, category_id, title, description, emoji,
      focus_enabled, recommended_focus_preset_id, task_kind, recurrence_type,
      recurrence_config, time_mode, day_part, start_time, end_time, start_date,
      end_date, is_active, sort_order, archived_at
    )
    select
      current_user_id, duplicated_schedule_id, 'schedule',
      case
        when task.category_id is null then null
        when category_ids ? task.category_id::text
          then (category_ids ->> task.category_id::text)::uuid
        else task.category_id
      end,
      task.title, task.description, task.emoji, task.focus_enabled,
      task.recommended_focus_preset_id, task.task_kind, task.recurrence_type,
      task.recurrence_config, task.time_mode, task.day_part, task.start_time,
      task.end_time, task.start_date, task.end_date, true, task.sort_order, null
    from public.tasks as task
    where task.user_id = current_user_id
      and task.schedule_id = source_schedule_id;
  end if;

  return duplicated_schedule_id;
end
$$;

revoke all on function public.duplicate_schedule(uuid, boolean) from public;
revoke all on function public.duplicate_schedule(uuid, boolean) from anon;
grant execute on function public.duplicate_schedule(uuid, boolean) to authenticated;
