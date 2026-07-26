-- Planora initial schema: ownership-safe, RLS-protected and recurrence-ready.
create extension if not exists pgcrypto;
create type public.app_locale as enum ('es','en');
create type public.app_theme as enum ('light','dark','system');
create type public.task_kind as enum ('one_time','habit');
create type public.recurrence_type as enum ('once','daily','weekdays','times_per_week','interval');
create type public.time_mode as enum ('anytime','day_part','specific_time','time_range');
create type public.day_part as enum ('morning','afternoon','night');

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text check (char_length(display_name) <= 100), avatar_url text,
 locale public.app_locale not null default 'es', timezone text not null default 'Europe/Madrid',
 theme public.app_theme not null default 'system', week_starts_on smallint not null default 1 check (week_starts_on between 0 and 6),
 active_schedule_id uuid, day_part_settings jsonb not null default '{"morning":{"start":"05:00","end":"12:00"},"afternoon":{"start":"12:00","end":"18:00"},"night":{"start":"18:00","end":"05:00"}}',
 onboarding_completed boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.schedules (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 name text not null check (char_length(name) between 1 and 80), description text check (char_length(description) <= 500), emoji text check (char_length(emoji) <= 16),
 is_archived boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id)
);
alter table public.profiles add constraint profiles_active_schedule_fk foreign key (active_schedule_id,id) references public.schedules(id,user_id) deferrable initially deferred;
create table public.categories (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 name text not null check (char_length(name) between 1 and 60), colour text not null check (colour ~ '^#[0-9A-Fa-f]{6}$'), emoji text check (char_length(emoji) <= 16), sort_order integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id)
);
create table public.tasks (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 schedule_id uuid not null, category_id uuid, title text not null check (char_length(title) between 1 and 140), description text check (char_length(description) <= 2000), emoji text check (char_length(emoji) <= 16),
 task_kind public.task_kind not null, recurrence_type public.recurrence_type not null, recurrence_config jsonb not null default '{}',
 time_mode public.time_mode not null default 'anytime', day_part public.day_part, start_time time, end_time time,
 start_date date not null, end_date date check (end_date is null or end_date >= start_date), is_active boolean not null default true, sort_order integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
 foreign key (schedule_id,user_id) references public.schedules(id,user_id) on delete restrict,
 foreign key (category_id,user_id) references public.categories(id,user_id) on delete restrict,
 unique(id,user_id),
 constraint task_timing_valid check ((time_mode='anytime' and day_part is null and start_time is null and end_time is null) or (time_mode='day_part' and day_part is not null and start_time is null and end_time is null) or (time_mode='specific_time' and day_part is null and start_time is not null and end_time is null) or (time_mode='time_range' and day_part is null and start_time is not null and end_time is not null and start_time < end_time))
);
create table public.task_completions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 task_id uuid not null, occurrence_date date not null, completed_at timestamptz not null default now(), task_snapshot jsonb not null,
 foreign key (task_id,user_id) references public.tasks(id,user_id) on delete restrict, unique(task_id,occurrence_date)
);
create table public.events (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 schedule_id uuid, category_id uuid, title text not null check (char_length(title) between 1 and 140), description text check (char_length(description) <= 2000), emoji text check (char_length(emoji) <= 16),
 event_date date not null, all_day boolean not null default true, start_time time, end_time time,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key (schedule_id,user_id) references public.schedules(id,user_id) on delete restrict,
 foreign key (category_id,user_id) references public.categories(id,user_id) on delete restrict,
 constraint event_time_valid check ((all_day and start_time is null and end_time is null) or (not all_day and start_time is not null and (end_time is null or start_time < end_time)))
);
create index schedules_user_idx on public.schedules(user_id,is_archived);
create index categories_user_idx on public.categories(user_id,sort_order);
create index tasks_schedule_dates_idx on public.tasks(user_id,schedule_id,start_date,end_date) where archived_at is null;
create index tasks_category_idx on public.tasks(category_id); create index completions_user_date_idx on public.task_completions(user_id,occurrence_date desc);
create index events_user_date_idx on public.events(user_id,event_date); create index events_schedule_idx on public.events(schedule_id,event_date);
create or replace function public.set_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end $$;
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger schedules_updated before update on public.schedules for each row execute function public.set_updated_at();
create trigger categories_updated before update on public.categories for each row execute function public.set_updated_at();
create trigger tasks_updated before update on public.tasks for each row execute function public.set_updated_at();
create trigger events_updated before update on public.events for each row execute function public.set_updated_at();
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.profiles(id,display_name,avatar_url) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name'),new.raw_user_meta_data->>'avatar_url') on conflict do nothing; return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security; alter table public.schedules enable row level security; alter table public.categories enable row level security; alter table public.tasks enable row level security; alter table public.task_completions enable row level security; alter table public.events enable row level security;
create policy schedules_select on public.schedules for select using (user_id=auth.uid()); create policy schedules_insert on public.schedules for insert with check (user_id=auth.uid()); create policy schedules_update on public.schedules for update using (user_id=auth.uid()) with check (user_id=auth.uid()); create policy schedules_delete on public.schedules for delete using (user_id=auth.uid());
create policy categories_select on public.categories for select using (user_id=auth.uid()); create policy categories_insert on public.categories for insert with check (user_id=auth.uid()); create policy categories_update on public.categories for update using (user_id=auth.uid()) with check (user_id=auth.uid()); create policy categories_delete on public.categories for delete using (user_id=auth.uid());
create policy tasks_select on public.tasks for select using (user_id=auth.uid()); create policy tasks_insert on public.tasks for insert with check (user_id=auth.uid()); create policy tasks_update on public.tasks for update using (user_id=auth.uid()) with check (user_id=auth.uid()); create policy tasks_delete on public.tasks for delete using (user_id=auth.uid());
create policy completions_select on public.task_completions for select using (user_id=auth.uid()); create policy completions_insert on public.task_completions for insert with check (user_id=auth.uid()); create policy completions_update on public.task_completions for update using (user_id=auth.uid()) with check (user_id=auth.uid()); create policy completions_delete on public.task_completions for delete using (user_id=auth.uid());
create policy events_select on public.events for select using (user_id=auth.uid()); create policy events_insert on public.events for insert with check (user_id=auth.uid()); create policy events_update on public.events for update using (user_id=auth.uid()) with check (user_id=auth.uid()); create policy events_delete on public.events for delete using (user_id=auth.uid());
create policy profiles_select on public.profiles for select using (id=auth.uid()); create policy profiles_insert on public.profiles for insert with check (id=auth.uid()); create policy profiles_update on public.profiles for update using (id=auth.uid()) with check (id=auth.uid()); create policy profiles_delete on public.profiles for delete using (id=auth.uid());

