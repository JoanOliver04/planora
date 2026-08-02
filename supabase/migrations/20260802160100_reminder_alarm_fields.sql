alter table public.reminders
  add column if not exists title text;

alter table public.reminders
  drop constraint if exists reminder_target_valid;

alter table public.reminders
  add constraint reminder_title_length
    check (title is null or char_length(title) between 1 and 140),
  add constraint reminder_target_valid check (
    (
      kind = 'daily_summary'
      and task_id is null
      and event_id is null
      and time_of_day is not null
      and title is null
    )
    or
    (
      kind = 'relative'
      and ((task_id is not null)::integer + (event_id is not null)::integer) = 1
      and minutes_before is not null
      and title is null
    )
    or
    (
      kind = 'alarm'
      and task_id is null
      and event_id is null
      and minutes_before is null
      and time_of_day is null
      and title is not null
    )
  );