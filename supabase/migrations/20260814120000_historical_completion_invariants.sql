-- Keep logical occurrence dates independent from the registration timestamp.
-- The unique (task_id, occurrence_date) constraint remains the identity.
create or replace function public.validate_task_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_task public.tasks%rowtype;
  current_category public.categories%rowtype;
  user_timezone text;
  weekly_target integer;
  weekly_count integer;
  interval_every integer;
  interval_unit text;
  month_distance integer;
begin
  select * into current_task
  from public.tasks
  where id = new.task_id and user_id = new.user_id;

  if not found then raise exception 'Task not found'; end if;

  select timezone into user_timezone
  from public.profiles
  where id = new.user_id;

  if new.occurrence_date > (pg_catalog.now() at time zone user_timezone)::date
  then raise exception 'Future occurrence'; end if;

  if current_task.category_id is not null then
    select * into current_category
    from public.categories
    where id = current_task.category_id and user_id = new.user_id;
  end if;

  if new.occurrence_date < current_task.start_date
    or (current_task.end_date is not null
      and new.occurrence_date > current_task.end_date)
  then raise exception 'Occurrence outside task dates'; end if;

  if current_task.archived_at is not null
    and new.occurrence_date >
      (current_task.archived_at at time zone user_timezone)::date
  then raise exception 'Task is archived'; end if;

  if current_task.recurrence_type = 'once'
    and new.occurrence_date <> current_task.start_date
  then raise exception 'Invalid one-time occurrence'; end if;

  if current_task.recurrence_type = 'weekdays'
    and not (extract(dow from new.occurrence_date)::integer in (
      select jsonb_array_elements_text(
        current_task.recurrence_config->'weekdays'
      )::integer
    ))
  then raise exception 'Invalid weekday occurrence'; end if;

  if current_task.recurrence_type = 'interval' then
    interval_every = (current_task.recurrence_config->>'every')::integer;
    interval_unit = current_task.recurrence_config->>'unit';
    month_distance =
      (extract(year from new.occurrence_date)::integer
        - extract(year from current_task.start_date)::integer) * 12
      + extract(month from new.occurrence_date)::integer
      - extract(month from current_task.start_date)::integer;

    if interval_every is null or interval_every < 1
      or (case interval_unit
        when 'day' then
          (new.occurrence_date - current_task.start_date) % interval_every <> 0
        when 'week' then
          extract(dow from new.occurrence_date) <>
            extract(dow from current_task.start_date)
          or ((new.occurrence_date - current_task.start_date) / 7)
            % interval_every <> 0
        when 'month' then
          month_distance % interval_every <> 0
          or extract(day from new.occurrence_date)::integer <>
            least(
              extract(day from current_task.start_date)::integer,
              extract(day from (
                date_trunc('month', new.occurrence_date) + interval '1 month - 1 day'
              ))::integer
            )
        else true
      end)
    then raise exception 'Invalid interval occurrence'; end if;
  end if;

  if current_task.recurrence_type = 'times_per_week' then
    weekly_target = (current_task.recurrence_config->>'target')::integer;
    select count(*) into weekly_count
    from public.task_completions
    where task_id = new.task_id
      and occurrence_date between
        date_trunc('week', new.occurrence_date::timestamp)::date
        and (date_trunc('week', new.occurrence_date::timestamp)::date + 6);
    if weekly_count >= weekly_target
    then raise exception 'Weekly target already reached'; end if;
  end if;

  new.task_snapshot = jsonb_build_object(
    'title', current_task.title,
    'emoji', current_task.emoji,
    'category_name', current_category.name,
    'category_colour', current_category.colour
  );
  return new;
end;
$$;
