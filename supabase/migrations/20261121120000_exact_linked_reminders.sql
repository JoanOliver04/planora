-- Existing linked reminders used their offset even if an unused clock time was present.
update public.reminders
set time_of_day = null
where kind = 'relative'
  and minutes_before is not null
  and time_of_day is not null;

alter table public.reminders
  drop constraint reminder_target_valid,
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
      and ((minutes_before is not null)::integer + (time_of_day is not null)::integer) = 1
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
