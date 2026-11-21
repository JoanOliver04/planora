set local lock_timeout = '5s';

create schema planora_reminders;
revoke all on schema planora_reminders from public, anon, authenticated, service_role;
grant usage on schema planora_reminders to authenticated;

create function planora_reminders.next_linked_trigger(
  target_date date, target_time time, minutes_before integer, exact_time time,
  recurrence public.reminder_recurrence, zone text, reference_time timestamptz,
  reject_clock_gap boolean
) returns timestamptz
language plpgsql stable set search_path = '' as $$
declare
  wall_time timestamp := target_date + coalesce(exact_time, target_time, time '09:00');
  first_trigger timestamptz;
  anchor_day date;
  alert_time time;
  candidate_day date;
  candidate timestamptz;
  step integer := case when recurrence = 'weekly' then 7 else 1 end;
begin
  first_trigger := wall_time at time zone zone;
  if reject_clock_gap and exact_time is not null
     and (first_trigger at time zone zone) <> wall_time then
    return null;
  end if;
  first_trigger := first_trigger - make_interval(mins => coalesce(minutes_before, 0));
  if first_trigger > reference_time or recurrence = 'once' then
    return first_trigger;
  end if;

  anchor_day := (first_trigger at time zone zone)::date;
  alert_time := coalesce(exact_time, (first_trigger at time zone zone)::time);
  candidate_day := (reference_time at time zone zone)::date;
  candidate_day := candidate_day - mod(candidate_day - anchor_day, step);
  candidate := (candidate_day + alert_time) at time zone zone;
  if candidate > reference_time then
    return candidate;
  end if;
  return (candidate_day + step + alert_time) at time zone zone;
exception when invalid_parameter_value then
  -- A malformed legacy timezone must not prevent edits to its source item.
  return null;
end;
$$;
revoke all on function planora_reminders.next_linked_trigger(date,time,integer,time,public.reminder_recurrence,text,timestamptz,boolean)
  from public, anon, authenticated, service_role;
grant execute on function planora_reminders.next_linked_trigger(date,time,integer,time,public.reminder_recurrence,text,timestamptz,boolean)
  to authenticated;

create function planora_reminders.reschedule_linked_reminders() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  target_task uuid;
  target_event uuid;
  target_date date;
  date_changed boolean;
begin
  if tg_relid = 'public.tasks'::regclass then
    target_task := new.id;
    target_date := new.start_date;
    date_changed := old.start_date is distinct from new.start_date;
  else
    target_event := new.id;
    target_date := new.event_date;
    date_changed := old.event_date is distinct from new.event_date;
  end if;

  -- Use the same lock order as the editor: source item, reminder, then outbox.
  with locked as materialized (
    select r.*
    from public.reminders r
    where r.user_id = new.user_id and r.kind = 'relative'
      and (r.task_id = target_task or r.event_id = target_event)
      and (date_changed or r.minutes_before is not null)
      and (
        r.enabled or r.recurrence <> 'once' or r.last_delivered_at is null
        or r.next_trigger_at > r.last_delivered_at
      )
    order by r.id
    for update
  ), planned as materialized (
    select r.*, planora_reminders.next_linked_trigger(
      target_date, new.start_time, r.minutes_before, r.time_of_day,
      r.recurrence, r.timezone, now(), false
    ) as trigger_at
    from locked r
  )
  update public.reminders r
  set next_trigger_at = p.trigger_at, snoozed_until = null, delivery_status = 'pending',
      enabled = p.trigger_at > now() and (
        p.enabled or (p.recurrence = 'once' and exists (
          select 1 from planora_push.outbox job
          where job.reminder_id = p.id and job.status = 'pending'
        ))
      )
  from planned p
  where r.id = p.id and p.trigger_at is not null
    and p.trigger_at is distinct from p.next_trigger_at;
  return new;
end;
$$;
revoke all on function planora_reminders.reschedule_linked_reminders()
  from public, anon, authenticated, service_role;

create trigger reschedule_event_reminders after update of event_date, start_time
  on public.events for each row
  when (old.event_date is distinct from new.event_date or old.start_time is distinct from new.start_time)
  execute function planora_reminders.reschedule_linked_reminders();

create trigger reschedule_task_reminders after update of start_date, start_time
  on public.tasks for each row
  when (old.start_date is distinct from new.start_date or old.start_time is distinct from new.start_time)
  execute function planora_reminders.reschedule_linked_reminders();

create function public.save_linked_reminder(
  p_id uuid, p_task_id uuid, p_event_id uuid, p_minutes_before integer, p_time_of_day time,
  p_recurrence public.reminder_recurrence, p_timezone text, p_enabled boolean
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
  task public.tasks%rowtype;
  existing public.reminders%rowtype;
  target_date date;
  target_time time;
  trigger_at timestamptz;
  result uuid;
begin
  if uid is null or (p_task_id is null) = (p_event_id is null)
     or (p_minutes_before is null) = (p_time_of_day is null) then
    raise exception 'Invalid linked reminder' using errcode = '22023';
  end if;

  if p_task_id is not null then
    select t.* into task from public.tasks t
    where t.id = p_task_id and t.user_id = uid
    for share;
    target_date := task.start_date;
    target_time := task.start_time;
  else
    select e.event_date, e.start_time into target_date, target_time
    from public.events e where e.id = p_event_id and e.user_id = uid
    for share;
  end if;
  if not found then
    raise exception 'Reminder target unavailable' using errcode = '22023';
  end if;

  if p_id is not null then
    select r.* into existing from public.reminders r
    where r.id = p_id and r.user_id = uid and r.kind = 'relative'
    for update;
    if not found then
      raise exception 'Linked reminder unavailable' using errcode = '22023';
    end if;
    p_timezone := existing.timezone;
  end if;

  if p_task_id is not null and existing.task_id is distinct from p_task_id
     and (task.archived_at is not null or not task.is_active
          or (task.scope <> 'global' and not exists (
            select 1 from public.profiles p where p.id = uid and p.active_schedule_id = task.schedule_id
          ))) then
    raise exception 'Reminder task unavailable' using errcode = '22023';
  end if;

  trigger_at := planora_reminders.next_linked_trigger(
    target_date, target_time, p_minutes_before, p_time_of_day, p_recurrence,
    p_timezone, clock_timestamp(), true
  );
  if trigger_at is null or trigger_at <= clock_timestamp() then
    raise exception 'Invalid reminder time' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.reminders (
      user_id, task_id, event_id, kind, minutes_before, time_of_day, recurrence,
      timezone, next_trigger_at, enabled
    ) values (
      uid, p_task_id, p_event_id, 'relative', p_minutes_before, p_time_of_day,
      p_recurrence, p_timezone, trigger_at, p_enabled
    ) returning id into result;
  else
    update public.reminders
    set task_id = p_task_id, event_id = p_event_id, minutes_before = p_minutes_before,
        time_of_day = p_time_of_day, recurrence = p_recurrence, next_trigger_at = trigger_at,
        delivery_status = 'pending', snoozed_until = null
    where id = p_id and user_id = uid returning id into result;
  end if;
  return result;
end;
$$;
revoke all on function public.save_linked_reminder(uuid,uuid,uuid,integer,time,public.reminder_recurrence,text,boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.save_linked_reminder(uuid,uuid,uuid,integer,time,public.reminder_recurrence,text,boolean)
  to authenticated;
