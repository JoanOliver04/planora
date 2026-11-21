create or replace function public.claim_push_jobs() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; candidate timestamp; next_at timestamptz; results jsonb;
begin
  update planora_push.configuration set last_dispatch_at=now() where id;
  delete from public.push_subscriptions where expires_at<=now();
  delete from planora_push.outbox where occurrence<now()-interval '7 days';
  update planora_push.outbox set status='failed' where status='pending' and (lease_until is null or lease_until<now()) and (expires_at<=now() or attempts>=5);
  for r in select rem.*, greatest(rem.next_trigger_at,rem.snoozed_until) as due_at, p.locale
    from public.reminders rem join public.profiles p on p.id=rem.user_id
    where rem.enabled and rem.next_trigger_at<=now()
      and (rem.snoozed_until is null or rem.snoozed_until<=now())
      and exists(select 1 from public.push_subscriptions s where s.user_id=rem.user_id and coalesce((s.preferences->>'system')::boolean,true))
    order by due_at limit 50 for update of rem skip locked
  loop
    next_at:=null;
    if r.recurrence<>'once' then
      -- Advance past the occurrence being delivered, preserving the requested local time.
      -- PostgreSQL shifts only the affected occurrence when daylight saving skips that time.
      candidate := greatest(
        (now() at time zone r.timezone)::date,
        (r.next_trigger_at at time zone r.timezone)::date + 1
      ) + coalesce(r.time_of_day, (r.next_trigger_at at time zone r.timezone)::time);
      if r.recurrence='weekly' then candidate:=candidate + ((extract(isodow from r.next_trigger_at at time zone r.timezone)::int-extract(isodow from candidate)::int+7)%7)*interval '1 day'; end if;
      next_at:=candidate at time zone r.timezone;
      if next_at<=now() then next_at:=(candidate+case when r.recurrence='weekly' then interval '7 days' else interval '1 day' end) at time zone r.timezone; end if;
    end if;
    -- Cancel previous pending work first, then atomically enqueue this occurrence.
    update public.reminders set enabled=(next_at is not null),next_trigger_at=coalesce(next_at,r.next_trigger_at),snoozed_until=null where id=r.id;
    if r.due_at>now()-interval '24 hours' then
      insert into planora_push.outbox(subscription_id,reminder_id,occurrence,payload)
      select s.id,r.id,r.due_at,jsonb_build_object(
        'title',case when r.kind='alarm' then case when r.locale='es' then 'Alarma de Planora' else 'Planora alarm' end when r.kind='daily_summary' then case when r.locale='es' then 'Tu resumen diario' else 'Your daily summary' end else 'Planora' end,
        'body',left(coalesce(r.title,(select t.title from public.tasks t where t.id=r.task_id and t.user_id=r.user_id),(select e.title from public.events e where e.id=r.event_id and e.user_id=r.user_id),case when r.locale='es' then 'Es hora de revisar tu planificación.' else 'It is time to check your plan.' end),240),
        'tag','push:'||r.id||':'||extract(epoch from r.due_at)::bigint,
        'url','/'||r.locale||case when r.kind='daily_summary' then '/summary' else '/reminders' end,
        'silent',not coalesce((s.preferences->>'sound')::boolean,true),'requireInteraction',r.kind='alarm',
        'channel',case when r.kind='alarm' then 'alarms' when r.kind='daily_summary' then 'summaries' when r.event_id is not null then 'events' else 'tasks' end)
      from public.push_subscriptions s where s.user_id=r.user_id and s.expires_at>now() and coalesce((s.preferences->>'system')::boolean,true)
        and coalesce((s.preferences->>(case when r.kind='alarm' then 'alarms' when r.kind='daily_summary' then 'summaries' when r.event_id is not null then 'events' else 'tasks' end))::boolean,true)
      on conflict do nothing;
    end if;
    update planora_push.outbox set reminder_version=(select planora_push.reminder_revision(x) from public.reminders x where x.id=r.id) where reminder_id=r.id and occurrence=r.due_at;
  end loop;
  with picked as (
    select j.id from planora_push.outbox j join public.push_subscriptions s on s.id=j.subscription_id
    where j.status='pending' and j.available_at<=now() and (j.lease_until is null or j.lease_until<now()) and s.expires_at>now()
      and coalesce((s.preferences->>'system')::boolean,true)
      and coalesce((s.preferences->>(j.payload->>'channel'))::boolean,true)
      and (j.reminder_id is null or exists(select 1 from public.reminders rem where rem.id=j.reminder_id and planora_push.reminder_revision(rem)=j.reminder_version))
    order by j.available_at limit 25 for update of j skip locked
  ), claimed as (
    update planora_push.outbox j set lease=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1
    from picked where j.id=picked.id returning j.*
  ) select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'lease',j.lease,'payload',j.payload,'endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth))),'[]') into results
    from claimed j join public.push_subscriptions s on s.id=j.subscription_id;
  return results;
end;
$$;
