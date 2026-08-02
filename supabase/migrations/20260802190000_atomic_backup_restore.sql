-- Replace an authenticated user's workspace from a validated backup in one transaction.
create or replace function public.restore_planora_backup(backup_data jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  profile_data jsonb := backup_data->'profile';
  schedules_data jsonb := coalesce(backup_data->'schedules', '[]'::jsonb);
  categories_data jsonb := coalesce(backup_data->'categories', '[]'::jsonb);
  tasks_data jsonb := coalesce(backup_data->'tasks', '[]'::jsonb);
  events_data jsonb := coalesce(backup_data->'events', '[]'::jsonb);
  completions_data jsonb := coalesce(backup_data->'completions', '[]'::jsonb);
  templates_data jsonb := coalesce(backup_data->'templates', '[]'::jsonb);
  reminders_data jsonb := coalesce(backup_data->'reminders', '[]'::jsonb);
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(backup_data) <> 'object'
    or jsonb_typeof(schedules_data) <> 'array'
    or jsonb_typeof(categories_data) <> 'array'
    or jsonb_typeof(tasks_data) <> 'array'
    or jsonb_typeof(events_data) <> 'array'
    or jsonb_typeof(completions_data) <> 'array'
    or jsonb_typeof(templates_data) <> 'array'
    or jsonb_typeof(reminders_data) <> 'array'
    or jsonb_array_length(schedules_data) > 200
    or jsonb_array_length(categories_data) > 500
    or jsonb_array_length(tasks_data) > 5000
    or jsonb_array_length(events_data) > 5000
    or jsonb_array_length(completions_data) > 20000
    or jsonb_array_length(templates_data) > 500
    or jsonb_array_length(reminders_data) > 1000
  then raise exception 'Invalid backup payload'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(current_user_id::text, 7012026));
  perform 1 from public.profiles where id = current_user_id for update;
  if not found then raise exception 'Profile not found'; end if;

  -- The profile points to schedules, so release that deferred relationship first.
  update public.profiles set active_schedule_id = null where id = current_user_id;
  delete from public.template_imports where user_id = current_user_id;
  delete from public.reminders where user_id = current_user_id;
  delete from public.task_completions where user_id = current_user_id;
  delete from public.events where user_id = current_user_id;
  delete from public.tasks where user_id = current_user_id;
  delete from public.schedule_templates where user_id = current_user_id;
  delete from public.categories where user_id = current_user_id;
  delete from public.schedules where user_id = current_user_id;

  insert into public.schedules(id, user_id, name, description, emoji, is_archived, sort_order)
  select x.id, current_user_id, x.name, x.description, x.emoji, x.is_archived, x.sort_order
  from jsonb_to_recordset(schedules_data) as x(
    id uuid, name text, description text, emoji text, is_archived boolean, sort_order integer
  );

  insert into public.categories(id, user_id, name, colour, emoji, sort_order)
  select x.id, current_user_id, x.name, x.colour, x.emoji, x.sort_order
  from jsonb_to_recordset(categories_data) as x(
    id uuid, name text, colour text, emoji text, sort_order integer
  );

  insert into public.tasks(
    id, user_id, schedule_id, category_id, title, description, emoji,
    task_kind, recurrence_type, recurrence_config, time_mode, day_part,
    start_time, end_time, start_date, end_date, is_active, sort_order, archived_at
  )
  select x.id, current_user_id, x.schedule_id, x.category_id, x.title,
    x.description, x.emoji, x.task_kind, x.recurrence_type,
    x.recurrence_config, x.time_mode, x.day_part, x.start_time, x.end_time,
    x.start_date, x.end_date, x.is_active, x.sort_order, x.archived_at
  from jsonb_to_recordset(tasks_data) as x(
    id uuid, schedule_id uuid, category_id uuid, title text, description text,
    emoji text, task_kind public.task_kind, recurrence_type public.recurrence_type,
    recurrence_config jsonb, time_mode public.time_mode, day_part public.day_part,
    start_time time, end_time time, start_date date, end_date date,
    is_active boolean, sort_order integer, archived_at timestamptz
  );

  insert into public.events(
    id, user_id, schedule_id, category_id, title, description, emoji,
    event_date, all_day, start_time, end_time
  )
  select x.id, current_user_id, x.schedule_id, x.category_id, x.title,
    x.description, x.emoji, x.event_date, x.all_day, x.start_time, x.end_time
  from jsonb_to_recordset(events_data) as x(
    id uuid, schedule_id uuid, category_id uuid, title text, description text,
    emoji text, event_date date, all_day boolean, start_time time, end_time time
  );

  insert into public.task_completions(
    id, user_id, task_id, occurrence_date, completed_at, task_snapshot
  )
  select x.id, current_user_id, x.task_id, x.occurrence_date,
    x.completed_at, x.task_snapshot
  from jsonb_to_recordset(completions_data) as x(
    id uuid, task_id uuid, occurrence_date date, completed_at timestamptz,
    task_snapshot jsonb
  );

  insert into public.schedule_templates(id, user_id, name, emoji, content)
  select x.id, current_user_id, x.name, x.emoji, x.content
  from jsonb_to_recordset(templates_data) as x(
    id uuid, name text, emoji text, content jsonb
  );

  insert into public.reminders(
    id, user_id, task_id, event_id, kind, title, minutes_before,
    recurrence, time_of_day, timezone, next_trigger_at, snoozed_until,
    enabled, delivery_status, last_delivered_at
  )
  select x.id, current_user_id, x.task_id, x.event_id, x.kind, x.title,
    x.minutes_before, x.recurrence, x.time_of_day, x.timezone,
    x.next_trigger_at, null, false, 'pending'::public.delivery_status, null
  from jsonb_to_recordset(reminders_data) as x(
    id uuid, task_id uuid, event_id uuid, kind public.reminder_kind,
    title text, minutes_before integer, recurrence public.reminder_recurrence,
    time_of_day time, timezone text, next_trigger_at timestamptz
  );

  if profile_data is not null and jsonb_typeof(profile_data) = 'object' then
    update public.profiles set
      locale = (profile_data->>'locale')::public.app_locale,
      timezone = profile_data->>'timezone',
      theme = (profile_data->>'theme')::public.app_theme,
      week_starts_on = (profile_data->>'week_starts_on')::smallint,
      active_schedule_id = nullif(profile_data->>'active_schedule_id', '')::uuid,
      day_part_settings = coalesce(profile_data->'day_part_settings', '{}'::jsonb),
      preferences = coalesce(profile_data->'preferences', '{}'::jsonb),
      onboarding_completed = coalesce((profile_data->>'onboarding_completed')::boolean, true)
    where id = current_user_id;
  end if;

  return jsonb_build_object(
    'schedules', jsonb_array_length(schedules_data),
    'categories', jsonb_array_length(categories_data),
    'tasks', jsonb_array_length(tasks_data),
    'events', jsonb_array_length(events_data),
    'completions', jsonb_array_length(completions_data),
    'templates', jsonb_array_length(templates_data),
    'reminders', (select count(*) from jsonb_array_elements(reminders_data) item where item->>'kind' <> 'alarm'),
    'alarms', (select count(*) from jsonb_array_elements(reminders_data) item where item->>'kind' = 'alarm')
  );
end
$$;

revoke all on function public.restore_planora_backup(jsonb) from public;
grant execute on function public.restore_planora_backup(jsonb) to authenticated;