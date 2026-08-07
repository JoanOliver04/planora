-- Planora Enfoque: presets, sessions, intervals and weekly goals.
-- Ownership-safe FKs, RLS, one active session per user, optimistic revision.
-- Durations are accumulated from interval transitions; never tick-per-second rows.

-- ---------------------------------------------------------------------------
-- focus_presets
-- ---------------------------------------------------------------------------
create table public.focus_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  mode text not null check (mode in ('countdown', 'stopwatch', 'cycles')),
  focus_duration_sec integer check (
    focus_duration_sec is null or focus_duration_sec between 60 and 8 * 60 * 60
  ),
  short_break_sec integer check (
    short_break_sec is null or short_break_sec between 0 and 60 * 60
  ),
  long_break_sec integer check (
    long_break_sec is null or long_break_sec between 0 and 3 * 60 * 60
  ),
  cycles_before_long_break integer check (
    cycles_before_long_break is null or cycles_before_long_break between 1 and 20
  ),
  target_cycles integer check (
    target_cycles is null or target_cycles between 1 and 50
  ),
  auto_start_breaks boolean not null default true,
  auto_start_focus boolean not null default false,
  sound_enabled boolean not null default true,
  vibration_enabled boolean not null default true,
  notify_on_phase_end boolean not null default true,
  complete_task_on_session_end boolean not null default false,
  keep_screen_awake boolean not null default false,
  prefer_fullscreen boolean not null default false,
  segments jsonb not null default '[]'::jsonb,
  is_favorite boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint focus_presets_mode_duration_valid check (
    (mode = 'stopwatch')
    or (mode in ('countdown', 'cycles') and focus_duration_sec is not null)
  ),
  constraint focus_presets_segments_is_array check (jsonb_typeof(segments) = 'array')
);

comment on table public.focus_presets is
  'User-owned focus session templates. System quick defaults may live in app code.';
comment on column public.focus_presets.segments is
  'Optional structured plan JSON validated in the application layer.';
comment on column public.focus_presets.complete_task_on_session_end is
  'Default false: finishing a session never auto-completes a task unless explicit.';

create index focus_presets_user_sort_idx
  on public.focus_presets (user_id, sort_order, created_at);

create trigger focus_presets_updated
  before update on public.focus_presets
  for each row execute function public.set_updated_at();

alter table public.focus_presets enable row level security;

create policy focus_presets_select on public.focus_presets
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy focus_presets_insert on public.focus_presets
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy focus_presets_update on public.focus_presets
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy focus_presets_delete on public.focus_presets
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- focus_sessions
-- ---------------------------------------------------------------------------
create table public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (
    status in ('running', 'paused', 'on_break', 'completed', 'cancelled')
  ),
  mode text not null check (mode in ('countdown', 'stopwatch', 'cycles')),
  title text check (title is null or char_length(title) between 1 and 140),
  preset_id uuid,
  task_id uuid,
  category_id uuid,
  schedule_id uuid,
  occurrence_date date,
  planned_focus_sec integer check (
    planned_focus_sec is null or planned_focus_sec between 60 and 8 * 60 * 60
  ),
  focus_sec integer not null default 0 check (focus_sec >= 0),
  paused_sec integer not null default 0 check (paused_sec >= 0),
  break_sec integer not null default 0 check (break_sec >= 0),
  current_phase_kind text check (
    current_phase_kind is null
    or current_phase_kind in ('focus', 'short_break', 'long_break', 'pause')
  ),
  current_cycle integer not null default 1 check (current_cycle >= 1),
  config jsonb not null default '{}'::jsonb,
  link_snapshot jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 4000),
  distractions jsonb not null default '[]'::jsonb,
  subjective_focus smallint check (
    subjective_focus is null or subjective_focus between 1 and 5
  ),
  subjective_energy smallint check (
    subjective_energy is null or subjective_energy between 1 and 5
  ),
  complete_task_on_end boolean not null default false,
  task_completion_applied boolean not null default false,
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (preset_id, user_id)
    references public.focus_presets (id, user_id) on delete set null,
  foreign key (task_id, user_id)
    references public.tasks (id, user_id) on delete set null,
  foreign key (category_id, user_id)
    references public.categories (id, user_id) on delete set null,
  foreign key (schedule_id, user_id)
    references public.schedules (id, user_id) on delete set null,
  constraint focus_sessions_config_is_object check (jsonb_typeof(config) = 'object'),
  constraint focus_sessions_link_snapshot_is_object check (
    jsonb_typeof(link_snapshot) = 'object'
  ),
  constraint focus_sessions_distractions_is_array check (
    jsonb_typeof(distractions) = 'array'
  ),
  constraint focus_sessions_ended_at_valid check (
    ended_at is null or ended_at >= started_at
  ),
  constraint focus_sessions_terminal_has_ended_at check (
    (status in ('completed', 'cancelled') and ended_at is not null)
    or (status in ('running', 'paused', 'on_break') and ended_at is null)
  ),
  constraint focus_sessions_active_has_phase check (
    status in ('completed', 'cancelled')
    or current_phase_kind is not null
  ),
  constraint focus_sessions_mode_plan_valid check (
    mode = 'stopwatch'
    or planned_focus_sec is not null
    or (config ? 'focus_duration_sec')
  )
);

comment on table public.focus_sessions is
  'Focus sessions. Active states are running/paused/on_break; history is completed/cancelled.';
comment on column public.focus_sessions.link_snapshot is
  'Minimal linked task/category/schedule snapshot so history stays readable after deletes.';
comment on column public.focus_sessions.revision is
  'Optimistic concurrency token. Mutate with WHERE revision = expected and increment.';
comment on column public.focus_sessions.focus_sec is
  'Accumulated closed focus seconds; open interval elapsed is derived at read time.';
comment on column public.focus_sessions.notes is
  'Private session notes. Never send to analytics or logs.';
comment on column public.focus_sessions.distractions is
  'Private parked distractions JSON array. Never send to analytics or logs.';

-- At most one active session per user (DB-enforced, not UI-only).
create unique index focus_sessions_one_active_per_user
  on public.focus_sessions (user_id)
  where status in ('running', 'paused', 'on_break');

create index focus_sessions_user_started_idx
  on public.focus_sessions (user_id, started_at desc);
create index focus_sessions_user_status_idx
  on public.focus_sessions (user_id, status);
create index focus_sessions_task_idx
  on public.focus_sessions (user_id, task_id)
  where task_id is not null;
create index focus_sessions_preset_idx
  on public.focus_sessions (user_id, preset_id)
  where preset_id is not null;

create trigger focus_sessions_updated
  before update on public.focus_sessions
  for each row execute function public.set_updated_at();

alter table public.focus_sessions enable row level security;

create policy focus_sessions_select on public.focus_sessions
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy focus_sessions_insert on public.focus_sessions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy focus_sessions_update on public.focus_sessions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy focus_sessions_delete on public.focus_sessions
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- focus_intervals
-- ---------------------------------------------------------------------------
create table public.focus_intervals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null,
  kind text not null check (
    kind in ('focus', 'short_break', 'long_break', 'pause')
  ),
  sequence integer not null check (sequence >= 0),
  cycle_index integer check (cycle_index is null or cycle_index >= 1),
  started_at timestamptz not null,
  ended_at timestamptz,
  planned_duration_sec integer check (
    planned_duration_sec is null or planned_duration_sec >= 0
  ),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (session_id, sequence),
  foreign key (session_id, user_id)
    references public.focus_sessions (id, user_id) on delete cascade,
  constraint focus_intervals_ended_at_valid check (
    ended_at is null or ended_at >= started_at
  )
);

comment on table public.focus_intervals is
  'Real phase transitions for a session. Open row (ended_at null) is the live interval.';
comment on column public.focus_intervals.sequence is
  '0-based order within the session; unique per session.';

-- At most one open interval per session.
create unique index focus_intervals_one_open_per_session
  on public.focus_intervals (session_id)
  where ended_at is null;

create index focus_intervals_session_seq_idx
  on public.focus_intervals (session_id, sequence);
create index focus_intervals_user_started_idx
  on public.focus_intervals (user_id, started_at desc);

alter table public.focus_intervals enable row level security;

create policy focus_intervals_select on public.focus_intervals
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy focus_intervals_insert on public.focus_intervals
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy focus_intervals_update on public.focus_intervals
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy focus_intervals_delete on public.focus_intervals
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- focus_goals
-- ---------------------------------------------------------------------------
create table public.focus_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  period text not null default 'weekly' check (period in ('weekly')),
  target_focus_sec integer not null check (target_focus_sec > 0),
  timezone text not null check (char_length(timezone) between 1 and 100),
  week_starts_on smallint not null default 1 check (week_starts_on between 0 and 6),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

comment on table public.focus_goals is
  'User focus time targets. v1 supports a single active weekly goal per user.';
comment on column public.focus_goals.target_focus_sec is
  'Must be strictly positive; zero or negative targets are rejected.';

-- One active weekly goal per user.
create unique index focus_goals_one_active_weekly_per_user
  on public.focus_goals (user_id)
  where active and period = 'weekly';

create index focus_goals_user_idx on public.focus_goals (user_id, active);

create trigger focus_goals_updated
  before update on public.focus_goals
  for each row execute function public.set_updated_at();

alter table public.focus_goals enable row level security;

create policy focus_goals_select on public.focus_goals
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy focus_goals_insert on public.focus_goals
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy focus_goals_update on public.focus_goals
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy focus_goals_delete on public.focus_goals
  for delete to authenticated
  using ((select auth.uid()) = user_id);
