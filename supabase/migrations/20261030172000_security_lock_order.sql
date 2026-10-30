-- Take the shared owner advisory lock before explicit row locks in user RPCs.
-- This matches direct-write quotas and atomic restore, preventing lock inversion.

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
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(auth.uid()::text, 7012026)
  );

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

create or replace function public.complete_guided_onboarding(
  goal text,
  schedule_name text,
  detected_timezone text,
  week_start integer,
  accent_colour text,
  skip_setup boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_schedule_id uuid;
  current_locale public.app_locale;
  category_names text[];
  category_colours text[];
  category_emojis text[];
  schedule_emoji text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(auth.uid()::text, 7012026)
  );

  if goal not in ('studies', 'work', 'habits', 'personal') then
    raise exception 'Invalid onboarding goal';
  end if;
  if schedule_name is null or char_length(trim(schedule_name)) not between 1 and 80 then
    raise exception 'Invalid schedule name';
  end if;
  if week_start not in (0, 1) then raise exception 'Invalid week start'; end if;
  if accent_colour !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Invalid accent'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = detected_timezone) then
    raise exception 'Invalid timezone';
  end if;

  select locale into current_locale
  from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Profile not found'; end if;

  select active_schedule_id into new_schedule_id
  from public.profiles where id = auth.uid() and onboarding_completed;
  if new_schedule_id is not null then return new_schedule_id; end if;

  schedule_emoji := case goal when 'studies' then '📚' when 'work' then '💼'
    when 'habits' then '🌱' else '✨' end;
  insert into public.schedules(user_id, name, emoji)
  values (auth.uid(), trim(schedule_name), schedule_emoji)
  returning id into new_schedule_id;

  if not skip_setup then
    category_colours := case goal
      when 'studies' then array['#4F6B45', '#6B5CA5']
      when 'work' then array['#315F78', '#8A5A44']
      when 'habits' then array['#3F7D58', '#7967A8']
      else array['#A06448', '#A17322'] end;
    category_emojis := case goal
      when 'studies' then array['📝', '🎓']
      when 'work' then array['🎯', '🤝']
      when 'habits' then array['🏃', '🧘']
      else array['🏠', '💛'] end;
    category_names := case
      when current_locale = 'es' and goal = 'studies' then array['Estudio', 'Clases']
      when current_locale = 'es' and goal = 'work' then array['Prioridades', 'Reuniones']
      when current_locale = 'es' and goal = 'habits' then array['Movimiento', 'Bienestar']
      when current_locale = 'es' then array['Casa', 'Personal']
      when goal = 'studies' then array['Study', 'Classes']
      when goal = 'work' then array['Priorities', 'Meetings']
      when goal = 'habits' then array['Movement', 'Wellbeing']
      else array['Home', 'Personal'] end;
    for i in 1..2 loop
      insert into public.categories(user_id, name, colour, emoji, sort_order)
      values (auth.uid(), category_names[i], category_colours[i], category_emojis[i], i);
    end loop;
  end if;

  update public.profiles
  set active_schedule_id = new_schedule_id,
      onboarding_completed = true,
      timezone = detected_timezone,
      week_starts_on = week_start,
      preferences = jsonb_build_object(
        'accent', lower(accent_colour), 'density', 'comfortable',
        'fontScale', 100, 'radius', 'rounded', 'reduceMotion', false,
        'showCompleted', true
      )
  where id = auth.uid();
  return new_schedule_id;
end
$$;

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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text, 7012026)
  );

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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text, 7012026)
  );

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
revoke all on function public.complete_onboarding(boolean, text) from public, anon;
grant execute on function public.complete_onboarding(boolean, text) to authenticated;
revoke all on function public.complete_guided_onboarding(text, text, text, integer, text, boolean) from public, anon;
grant execute on function public.complete_guided_onboarding(text, text, text, integer, text, boolean) to authenticated;
revoke all on function public.delete_schedule(uuid) from public, anon;
grant execute on function public.delete_schedule(uuid) to authenticated;
