-- Completion history is append/delete only. Snapshots are derived from trusted
-- rows in PostgreSQL instead of accepting client-provided historical data.
drop policy if exists completions_update on public.task_completions;

create or replace function public.validate_task_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_task public.tasks%rowtype;
  current_category public.categories%rowtype;
  weekly_target integer;
  weekly_count integer;
begin
  select *
  into current_task
  from public.tasks
  where id = new.task_id and user_id = new.user_id;

  if not found then raise exception 'Task not found'; end if;

  if current_task.category_id is not null then
    select *
    into current_category
    from public.categories
    where id = current_task.category_id and user_id = new.user_id;
  end if;

  if new.occurrence_date < current_task.start_date
    or (
      current_task.end_date is not null
      and new.occurrence_date > current_task.end_date
    )
  then
    raise exception 'Occurrence outside task dates';
  end if;

  if current_task.archived_at is not null
    and new.occurrence_date > (current_task.archived_at at time zone 'UTC')::date
  then
    raise exception 'Task is archived';
  end if;

  if current_task.recurrence_type = 'once'
    and new.occurrence_date <> current_task.start_date
  then
    raise exception 'Invalid one-time occurrence';
  end if;

  if current_task.recurrence_type = 'weekdays'
    and not (
      extract(dow from new.occurrence_date)::integer in (
        select jsonb_array_elements_text(
          current_task.recurrence_config->'weekdays'
        )::integer
      )
    )
  then
    raise exception 'Invalid weekday occurrence';
  end if;

  if current_task.recurrence_type = 'times_per_week' then
    weekly_target = (current_task.recurrence_config->>'target')::integer;
    select count(*)
    into weekly_count
    from public.task_completions
    where task_id = new.task_id
      and occurrence_date between
        date_trunc('week', new.occurrence_date::timestamp)::date
        and (date_trunc('week', new.occurrence_date::timestamp)::date + 6);
    if weekly_count >= weekly_target then
      raise exception 'Weekly target already reached';
    end if;
  end if;

  new.task_snapshot = jsonb_build_object(
    'title', current_task.title,
    'emoji', current_task.emoji,
    'category_name', current_category.name,
    'category_colour', current_category.colour
  );
  return new;
end
$$;

-- Serialise onboarding per profile, make retries idempotent and only persist
-- timezone identifiers known by PostgreSQL.
create or replace function public.complete_onboarding(
  include_starters boolean,
  detected_timezone text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  schedule_id uuid;
  existing_schedule_id uuid;
  already_completed boolean;
  current_locale public.app_locale;
  names text[];
  colours text[] := array['#7D9D74', '#D48A57', '#6C8CD5', '#9877B5'];
  i integer;
begin
  if detected_timezone is null
    or char_length(detected_timezone) > 100
    or not exists (
      select 1
      from pg_catalog.pg_timezone_names
      where name = detected_timezone
    )
  then
    raise exception 'Invalid timezone';
  end if;

  select locale, active_schedule_id, onboarding_completed
  into current_locale, existing_schedule_id, already_completed
  from public.profiles
  where id = auth.uid()
  for update;

  if not found then raise exception 'Profile not found'; end if;
  if already_completed and existing_schedule_id is not null then
    return existing_schedule_id;
  end if;

  insert into public.schedules(user_id, name, emoji)
  values (auth.uid(), 'Normal', '🌿')
  returning id into schedule_id;

  if include_starters then
    names := case
      when current_locale = 'es'
        then array['Higiene', 'Deporte', 'Estudios', 'Ocio']
      else array['Hygiene', 'Sport', 'Studies', 'Entertainment']
    end;
    for i in 1..4 loop
      insert into public.categories(user_id, name, colour, sort_order)
      values (auth.uid(), names[i], colours[i], i);
    end loop;
  end if;

  update public.profiles
  set active_schedule_id = schedule_id,
      onboarding_completed = true,
      timezone = detected_timezone
  where id = auth.uid();

  return schedule_id;
end
$$;
