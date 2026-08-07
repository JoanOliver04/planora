-- Flexible weekly Focus goals: metric, scope, considered days, multiple active.

alter table public.focus_goals
  add column if not exists metric text not null default 'focus_seconds'
    check (metric in ('focus_seconds', 'sessions', 'active_days')),
  add column if not exists target_value integer not null default 1
    check (target_value > 0 and target_value <= 8 * 60 * 60 * 14),
  add column if not exists scope text not null default 'global'
    check (scope in ('global', 'category', 'preset')),
  add column if not exists category_id uuid,
  add column if not exists preset_id uuid,
  add column if not exists start_date date not null default (timezone('utc', now()))::date,
  add column if not exists considered_days smallint[] not null
    default array[0,1,2,3,4,5,6]::smallint[],
  add column if not exists is_primary boolean not null default false,
  add column if not exists sort_order integer not null default 0;

-- Backfill target_value from legacy minutes target.
update public.focus_goals
set target_value = greatest(target_focus_sec, 1)
where metric = 'focus_seconds'
  and (target_value is null or target_value = 1)
  and target_focus_sec > 1;

-- Promote existing single active goals to primary.
update public.focus_goals
set is_primary = true
where active
  and period = 'weekly'
  and id in (
    select distinct on (user_id) id
    from public.focus_goals
    where active and period = 'weekly'
    order by user_id, created_at asc
  );

alter table public.focus_goals
  drop constraint if exists focus_goals_scope_refs_valid;

alter table public.focus_goals
  add constraint focus_goals_scope_refs_valid check (
    (scope = 'global' and category_id is null and preset_id is null)
    or (scope = 'category' and category_id is not null and preset_id is null)
    or (scope = 'preset' and preset_id is not null and category_id is null)
  );

alter table public.focus_goals
  drop constraint if exists focus_goals_considered_days_valid;

alter table public.focus_goals
  add constraint focus_goals_considered_days_valid check (
    cardinality(considered_days) between 1 and 7
    and considered_days <@ array[0,1,2,3,4,5,6]::smallint[]
  );

alter table public.focus_goals
  drop constraint if exists focus_goals_category_owner_fk;

alter table public.focus_goals
  add constraint focus_goals_category_owner_fk
  foreign key (category_id, user_id)
  references public.categories (id, user_id)
  on delete set null;

alter table public.focus_goals
  drop constraint if exists focus_goals_preset_owner_fk;

alter table public.focus_goals
  add constraint focus_goals_preset_owner_fk
  foreign key (preset_id, user_id)
  references public.focus_presets (id, user_id)
  on delete set null;

-- Allow several active weekly goals; only one primary active goal per user.
drop index if exists public.focus_goals_one_active_weekly_per_user;

create unique index if not exists focus_goals_one_primary_active_weekly
  on public.focus_goals (user_id)
  where active and is_primary and period = 'weekly';

create index if not exists focus_goals_user_active_sort_idx
  on public.focus_goals (user_id, active, is_primary desc, sort_order, created_at);

comment on column public.focus_goals.metric is
  'Weekly goal metric: focus_seconds, completed sessions, or active days.';
comment on column public.focus_goals.target_value is
  'Target in seconds (focus_seconds) or counts (sessions / active_days).';
comment on column public.focus_goals.scope is
  'global, category, or preset. Sessions filter by matching snapshot ids.';
comment on column public.focus_goals.considered_days is
  'Local weekdays 0=Sun..6=Sat included in the goal window.';
comment on column public.focus_goals.is_primary is
  'Primary goal shown on Focus home. At most one active primary per user.';
comment on column public.focus_goals.start_date is
  'Local calendar day from which the goal may apply. Mid-week edits recompute with current config.';

-- Restore writes flexible goal columns (keeps legacy target_focus_sec in sync).
create or replace function public.restore_planora_backup_core(backup_data jsonb)
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
  focus_presets_data jsonb := coalesce(backup_data->'focus_presets', '[]'::jsonb);
  focus_sessions_data jsonb := coalesce(backup_data->'focus_sessions', '[]'::jsonb);
  focus_intervals_data jsonb := coalesce(backup_data->'focus_intervals', '[]'::jsonb);
  focus_goals_data jsonb := coalesce(backup_data->'focus_goals', '[]'::jsonb);
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
    or jsonb_typeof(focus_presets_data) <> 'array'
    or jsonb_typeof(focus_sessions_data) <> 'array'
    or jsonb_typeof(focus_intervals_data) <> 'array'
    or jsonb_typeof(focus_goals_data) <> 'array'
    or jsonb_array_length(schedules_data) > 200
    or jsonb_array_length(categories_data) > 500
    or jsonb_array_length(tasks_data) > 5000
    or jsonb_array_length(events_data) > 5000
    or jsonb_array_length(completions_data) > 20000
    or jsonb_array_length(templates_data) > 500
    or jsonb_array_length(reminders_data) > 1000
    or jsonb_array_length(focus_presets_data) > 200
    or jsonb_array_length(focus_sessions_data) > 5000
    or jsonb_array_length(focus_intervals_data) > 50000
    or jsonb_array_length(focus_goals_data) > 50
  then raise exception 'Invalid backup payload'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(current_user_id::text, 7012026));
  perform 1 from public.profiles where id = current_user_id for update;
  if not found then raise exception 'Profile not found'; end if;

  update public.profiles set active_schedule_id = null where id = current_user_id;
  delete from public.focus_intervals where user_id = current_user_id;
  delete from public.focus_sessions where user_id = current_user_id;
  delete from public.focus_goals where user_id = current_user_id;
  delete from public.focus_presets where user_id = current_user_id;
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

  insert into public.categories(id, user_id, name, colour, emoji, schedule_id, sort_order)
  select x.id, current_user_id, x.name, x.colour, x.emoji, x.schedule_id, x.sort_order
  from jsonb_to_recordset(categories_data) as x(
    id uuid, name text, colour text, emoji text, schedule_id uuid, sort_order integer
  );

  insert into public.tasks(
    id, user_id, schedule_id, category_id, title, description, emoji,
    task_kind, recurrence_type, recurrence_config, time_mode, day_part,
    start_time, end_time, start_date, end_date, is_active, sort_order, archived_at, scope
  )
  select x.id, current_user_id, x.schedule_id, x.category_id, x.title,
    x.description, x.emoji, x.task_kind, x.recurrence_type,
    x.recurrence_config, x.time_mode, x.day_part, x.start_time, x.end_time,
    x.start_date, x.end_date, x.is_active, x.sort_order, x.archived_at,
    coalesce(nullif(x.scope, ''), 'schedule')
  from jsonb_to_recordset(tasks_data) as x(
    id uuid, schedule_id uuid, category_id uuid, title text, description text,
    emoji text, task_kind public.task_kind, recurrence_type public.recurrence_type,
    recurrence_config jsonb, time_mode public.time_mode, day_part public.day_part,
    start_time time, end_time time, start_date date, end_date date,
    is_active boolean, sort_order integer, archived_at timestamptz, scope text
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

  insert into public.focus_presets(
    id, user_id, name, mode, focus_duration_sec, short_break_sec, long_break_sec,
    cycles_before_long_break, target_cycles, auto_start_breaks, auto_start_focus,
    sound_enabled, vibration_enabled, notify_on_phase_end,
    complete_task_on_session_end, keep_screen_awake, prefer_fullscreen,
    segments, is_favorite, sort_order, emoji, intention, default_category_id, archived_at
  )
  select x.id, current_user_id, x.name, x.mode, x.focus_duration_sec,
    x.short_break_sec, x.long_break_sec, x.cycles_before_long_break,
    x.target_cycles, x.auto_start_breaks, x.auto_start_focus, x.sound_enabled,
    x.vibration_enabled, x.notify_on_phase_end, x.complete_task_on_session_end,
    x.keep_screen_awake, x.prefer_fullscreen,
    coalesce(x.segments, '[]'::jsonb), x.is_favorite, x.sort_order,
    x.emoji, x.intention, x.default_category_id, x.archived_at
  from jsonb_to_recordset(focus_presets_data) as x(
    id uuid, name text, mode text, focus_duration_sec integer,
    short_break_sec integer, long_break_sec integer,
    cycles_before_long_break integer, target_cycles integer,
    auto_start_breaks boolean, auto_start_focus boolean,
    sound_enabled boolean, vibration_enabled boolean,
    notify_on_phase_end boolean, complete_task_on_session_end boolean,
    keep_screen_awake boolean, prefer_fullscreen boolean,
    segments jsonb, is_favorite boolean, sort_order integer,
    emoji text, intention text, default_category_id uuid, archived_at timestamptz
  );

  insert into public.focus_sessions(
    id, user_id, status, mode, title, preset_id, task_id, category_id,
    schedule_id, occurrence_date, planned_focus_sec, focus_sec, paused_sec,
    break_sec, current_phase_kind, current_cycle, config, link_snapshot,
    started_at, ended_at, notes, distractions, subjective_focus,
    subjective_energy, complete_task_on_end, task_completion_applied, revision
  )
  select x.id, current_user_id, x.status, x.mode, x.title, x.preset_id,
    x.task_id, x.category_id, x.schedule_id, x.occurrence_date,
    x.planned_focus_sec, x.focus_sec, x.paused_sec, x.break_sec,
    x.current_phase_kind, x.current_cycle,
    coalesce(x.config, '{}'::jsonb), coalesce(x.link_snapshot, '{}'::jsonb),
    x.started_at, x.ended_at, x.notes, coalesce(x.distractions, '[]'::jsonb),
    x.subjective_focus, x.subjective_energy, x.complete_task_on_end,
    x.task_completion_applied, coalesce(x.revision, 1)
  from jsonb_to_recordset(focus_sessions_data) as x(
    id uuid, status text, mode text, title text, preset_id uuid, task_id uuid,
    category_id uuid, schedule_id uuid, occurrence_date date,
    planned_focus_sec integer, focus_sec integer, paused_sec integer,
    break_sec integer, current_phase_kind text, current_cycle integer,
    config jsonb, link_snapshot jsonb, started_at timestamptz,
    ended_at timestamptz, notes text, distractions jsonb,
    subjective_focus smallint, subjective_energy smallint,
    complete_task_on_end boolean, task_completion_applied boolean,
    revision integer
  );

  insert into public.focus_intervals(
    id, user_id, session_id, kind, sequence, cycle_index,
    started_at, ended_at, planned_duration_sec
  )
  select x.id, current_user_id, x.session_id, x.kind, x.sequence, x.cycle_index,
    x.started_at, x.ended_at, x.planned_duration_sec
  from jsonb_to_recordset(focus_intervals_data) as x(
    id uuid, session_id uuid, kind text, sequence integer, cycle_index integer,
    started_at timestamptz, ended_at timestamptz, planned_duration_sec integer
  );

  insert into public.focus_goals(
    id, user_id, period, target_focus_sec, metric, target_value, scope,
    category_id, preset_id, start_date, considered_days, is_primary, sort_order,
    timezone, week_starts_on, active
  )
  select x.id, current_user_id, coalesce(nullif(x.period, ''), 'weekly'),
    coalesce(x.target_focus_sec, x.target_value, 1),
    coalesce(nullif(x.metric, ''), 'focus_seconds'),
    coalesce(x.target_value, x.target_focus_sec, 1),
    coalesce(nullif(x.scope, ''), 'global'),
    x.category_id, x.preset_id,
    coalesce(x.start_date, (timezone('utc', now()))::date),
    coalesce(x.considered_days, array[0,1,2,3,4,5,6]::smallint[]),
    coalesce(x.is_primary, false), coalesce(x.sort_order, 0),
    x.timezone, x.week_starts_on, x.active
  from jsonb_to_recordset(focus_goals_data) as x(
    id uuid, period text, target_focus_sec integer, metric text,
    target_value integer, scope text, category_id uuid, preset_id uuid,
    start_date date, considered_days smallint[], is_primary boolean,
    sort_order integer, timezone text, week_starts_on smallint, active boolean
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
    'alarms', (select count(*) from jsonb_array_elements(reminders_data) item where item->>'kind' = 'alarm'),
    'focus_presets', jsonb_array_length(focus_presets_data),
    'focus_sessions', jsonb_array_length(focus_sessions_data),
    'focus_intervals', jsonb_array_length(focus_intervals_data),
    'focus_goals', jsonb_array_length(focus_goals_data)
  );
end
$$;

revoke all on function public.restore_planora_backup_core(jsonb) from public;
grant execute on function public.restore_planora_backup_core(jsonb) to authenticated;
