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
  i integer;
begin
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
