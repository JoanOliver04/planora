create type public.reminder_kind as enum ('relative', 'daily_summary');
create type public.reminder_recurrence as enum ('once', 'daily', 'weekly');
create type public.delivery_status as enum ('pending', 'delivered', 'permission_denied', 'failed', 'snoozed');
alter table public.events add constraint events_id_user_unique unique(id, user_id);
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid,
  event_id uuid,
  kind public.reminder_kind not null,
  minutes_before integer check (minutes_before between 0 and 10080),
  recurrence public.reminder_recurrence not null default 'once',
  time_of_day time,
  timezone text not null,
  next_trigger_at timestamptz not null,
  snoozed_until timestamptz,
  enabled boolean not null default true,
  delivery_status public.delivery_status not null default 'pending',
  last_delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (task_id, user_id) references public.tasks(id, user_id) on delete cascade,
  foreign key (event_id, user_id) references public.events(id, user_id) on delete cascade,
  constraint reminder_target_valid check (
    (kind = 'daily_summary' and task_id is null and event_id is null and time_of_day is not null)
    or
    (kind = 'relative' and ((task_id is not null)::integer + (event_id is not null)::integer) = 1 and minutes_before is not null)
  )
);
create index reminders_due_idx on public.reminders(user_id, next_trigger_at) where enabled;
create index reminders_task_idx on public.reminders(task_id) where task_id is not null;
create index reminders_event_idx on public.reminders(event_id) where event_id is not null;
create unique index reminders_daily_summary_unique on public.reminders(user_id) where kind = 'daily_summary';
create trigger reminders_updated before update on public.reminders
for each row execute function public.set_updated_at();
alter table public.reminders enable row level security;
create policy reminders_select on public.reminders for select using (user_id = auth.uid());
create policy reminders_insert on public.reminders for insert with check (user_id = auth.uid());
create policy reminders_update on public.reminders for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reminders_delete on public.reminders for delete using (user_id = auth.uid());
