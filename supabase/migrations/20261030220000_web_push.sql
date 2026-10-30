-- Durable device subscriptions and an outbox independent of open browser tabs.
create schema if not exists planora_push;
revoke all on schema planora_push from public, anon, authenticated;

create table planora_push.configuration (
  id boolean primary key default true check (id),
  public_key text not null,
  private_key text not null,
  dispatch_token text not null,
  dispatch_url text not null check (dispatch_url = 'https://planora-lake-one.vercel.app/api/push/dispatch'),
  last_dispatch_at timestamptz
);
alter table planora_push.configuration enable row level security;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references auth.sessions(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) <= 2048 and endpoint ~ '^https://(fcm.googleapis.com|updates.push.services.mozilla.com|[a-z0-9-]+\.push.services.mozilla.com|[a-z0-9-]+\.notify.windows.com|web.push.apple.com)/[^[:space:]]+$'),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{87}={0,2}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{22}={0,2}$'),
  preferences jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days'
);
create index push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public, anon, authenticated;
grant select on public.push_subscriptions to authenticated;
create policy push_subscriptions_select on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));

create table planora_push.outbox (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  reminder_id uuid references public.reminders(id) on delete cascade,
  reminder_version jsonb,
  occurrence timestamptz not null,
  payload jsonb not null,
  available_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 hour',
  attempts int not null default 0,
  lease uuid,
  lease_until timestamptz,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  last_code int,
  unique(subscription_id, reminder_id, occurrence)
);
alter table planora_push.outbox enable row level security;
create index push_outbox_pending_idx on planora_push.outbox(available_at) where status = 'pending';

create function public.push_configuration() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'publicKey', c.public_key,
    'ready', coalesce(c.last_dispatch_at > now() - interval '5 minutes',false),
    'endpoints', coalesce((select jsonb_agg(s.endpoint) from public.push_subscriptions s where s.user_id=auth.uid() and s.session_id=(auth.jwt()->>'session_id')::uuid and s.expires_at>now()),'[]'::jsonb),
    'managed', exists(select 1 from public.push_subscriptions s where s.user_id=auth.uid() and s.expires_at>now() and coalesce((s.preferences->>'system')::boolean,true))
  ) from planora_push.configuration c where c.id and auth.uid() is not null;
$$;
revoke all on function public.push_configuration() from public, anon;
grant execute on function public.push_configuration() to authenticated;

create function public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_preferences jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); sid uuid := (auth.jwt()->>'session_id')::uuid; result uuid;
begin
  if uid is null or not exists(select 1 from auth.sessions where id=sid and user_id=uid) then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_preferences)<>'object' or pg_column_size(p_preferences)>1024 or exists(select 1 from jsonb_each(p_preferences) where key not in ('tasks','events','summaries','alarms','system','sound','vibration','inApp') or jsonb_typeof(value)<>'boolean') then raise exception 'Invalid preferences'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 220001));
  if not exists(select 1 from public.push_subscriptions where user_id=uid and endpoint=p_endpoint) and (select count(*) from public.push_subscriptions where user_id=uid)>=8 then raise exception 'Device limit reached'; end if;
  insert into public.push_subscriptions(user_id,session_id,endpoint,p256dh,auth,preferences)
  values(uid,sid,p_endpoint,p_p256dh,p_auth,p_preferences)
  on conflict(endpoint) do update set session_id=sid,p256dh=p_p256dh,auth=p_auth,preferences=p_preferences,updated_at=now(),expires_at=now()+interval '90 days'
    where push_subscriptions.user_id=uid
  returning id into result;
  if result is null then raise exception 'Subscription belongs to another account'; end if;
  return result;
end;
$$;
revoke all on function public.register_push_subscription(text,text,text,jsonb) from public, anon;
grant execute on function public.register_push_subscription(text,text,text,jsonb) to authenticated;

create function public.remove_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where user_id=auth.uid() and endpoint=p_endpoint;
$$;
revoke all on function public.remove_push_subscription(text) from public, anon;
grant execute on function public.remove_push_subscription(text) to authenticated;

create function public.queue_push_test(p_endpoint text) returns void
language plpgsql security definer set search_path = '' as $$
declare sub uuid;
begin
  select id into sub from public.push_subscriptions where user_id=auth.uid() and endpoint=p_endpoint and session_id=(auth.jwt()->>'session_id')::uuid;
  if sub is null then raise exception 'Device not registered'; end if;
  if exists(select 1 from planora_push.outbox where subscription_id=sub and reminder_id is null and occurrence>now()-interval '5 minutes') then raise exception 'Test already scheduled'; end if;
  insert into planora_push.outbox(subscription_id,occurrence,available_at,payload)
  values(sub,now(),now()+interval '60 seconds',jsonb_build_object('title','Planora','body','Push OK · Planora','tag','planora-test:'||gen_random_uuid(),'url','/es/reminders','silent',false,'requireInteraction',false));
end;
$$;
revoke all on function public.queue_push_test(text) from public, anon;
grant execute on function public.queue_push_test(text) to authenticated;

create function public.push_dispatch_configuration() returns jsonb
language sql security definer set search_path = '' as $$
  select to_jsonb(c) from planora_push.configuration c where id;
$$;
revoke all on function public.push_dispatch_configuration() from public, anon, authenticated;
grant execute on function public.push_dispatch_configuration() to service_role;

create function public.claim_push_jobs() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; candidate timestamp; next_at timestamptz; results jsonb;
begin
  update planora_push.configuration set last_dispatch_at=now() where id;
  delete from public.push_subscriptions where expires_at<=now();
  delete from planora_push.outbox where occurrence<now()-interval '7 days';
  update planora_push.outbox set status='failed' where status='pending' and (expires_at<=now() or attempts>=5);
  for r in select r.*, p.locale from public.reminders r join public.profiles p on p.id=r.user_id
    where r.enabled and r.next_trigger_at<=now() and exists(select 1 from public.push_subscriptions s where s.user_id=r.user_id and coalesce((s.preferences->>'system')::boolean,true))
    order by r.next_trigger_at limit 50 for update of r skip locked
  loop
    if r.next_trigger_at>now()-interval '24 hours' then
      insert into planora_push.outbox(subscription_id,reminder_id,occurrence,payload)
      select s.id,r.id,r.next_trigger_at,jsonb_build_object(
        'title',case when r.kind='alarm' then case when r.locale='es' then 'Alarma de Planora' else 'Planora alarm' end when r.kind='daily_summary' then case when r.locale='es' then 'Tu resumen diario' else 'Your daily summary' end else 'Planora' end,
        'body',left(coalesce(r.title,(select t.title from public.tasks t where t.id=r.task_id and t.user_id=r.user_id),(select e.title from public.events e where e.id=r.event_id and e.user_id=r.user_id),case when r.locale='es' then 'Es hora de revisar tu planificación.' else 'It is time to check your plan.' end),240),
        'tag','push:'||r.id||':'||extract(epoch from r.next_trigger_at)::bigint,
        'url','/'||r.locale||case when r.kind='daily_summary' then '/summary' else '/reminders' end,
        'silent',not coalesce((s.preferences->>'sound')::boolean,true),'requireInteraction',r.kind='alarm')
      from public.push_subscriptions s where s.user_id=r.user_id and s.expires_at>now() and coalesce((s.preferences->>'system')::boolean,true)
        and coalesce((s.preferences->>(case when r.kind='alarm' then 'alarms' when r.kind='daily_summary' then 'summaries' when r.event_id is not null then 'events' else 'tasks' end))::boolean,true)
      on conflict do nothing;
    end if;
    next_at:=null;
    if r.recurrence<>'once' then
      candidate := (now() at time zone r.timezone)::date + (r.next_trigger_at at time zone r.timezone)::time;
      if r.recurrence='weekly' then candidate:=candidate + ((extract(isodow from r.next_trigger_at at time zone r.timezone)::int-extract(isodow from candidate)::int+7)%7)*interval '1 day'; end if;
      next_at:=candidate at time zone r.timezone;
      if next_at<=now() then next_at:=(candidate+case when r.recurrence='weekly' then interval '7 days' else interval '1 day' end) at time zone r.timezone; end if;
    end if;
    update public.reminders set enabled=(next_at is not null),next_trigger_at=coalesce(next_at,r.next_trigger_at),snoozed_until=null where id=r.id;
    update planora_push.outbox set reminder_version=(select jsonb_build_array(x.enabled,x.next_trigger_at at time zone 'UTC',x.timezone,x.title,x.task_id,x.event_id,x.recurrence,x.snoozed_until at time zone 'UTC') from public.reminders x where x.id=r.id) where reminder_id=r.id and occurrence=r.next_trigger_at;
  end loop;
  with picked as (
    select j.id from planora_push.outbox j join public.push_subscriptions s on s.id=j.subscription_id
    where j.status='pending' and j.available_at<=now() and (j.lease_until is null or j.lease_until<now()) and s.expires_at>now()
      and coalesce((s.preferences->>'system')::boolean,true)
      and (j.reminder_id is null or exists(select 1 from public.reminders r where r.id=j.reminder_id and jsonb_build_array(r.enabled,r.next_trigger_at at time zone 'UTC',r.timezone,r.title,r.task_id,r.event_id,r.recurrence,r.snoozed_until at time zone 'UTC')=j.reminder_version))
    order by j.available_at limit 25 for update of j skip locked
  ), claimed as (
    update planora_push.outbox j set lease=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1
    from picked where j.id=picked.id returning j.*
  ) select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'lease',j.lease,'payload',j.payload,'endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth))),'[]') into results
    from claimed j join public.push_subscriptions s on s.id=j.subscription_id;
  return results;
end;
$$;
revoke all on function public.claim_push_jobs() from public, anon, authenticated;
grant execute on function public.claim_push_jobs() to service_role;

create function public.finish_push_job(p_id uuid,p_lease uuid,p_code int) returns void
language plpgsql security definer set search_path = '' as $$
declare j planora_push.outbox;
begin
  select * into j from planora_push.outbox where id=p_id and lease=p_lease and status='pending' for update;
  if not found then return; end if;
  if p_code in (404,410) then
    update public.reminders set delivery_status='failed' where id=j.reminder_id and delivery_status<>'delivered';
    delete from public.push_subscriptions where id=j.subscription_id;
    return;
  end if;
  update planora_push.outbox set status=case when p_code between 200 and 299 then 'sent' when attempts>=5 or (p_code between 400 and 499 and p_code not in (408,429)) then 'failed' else 'pending' end,
    last_code=p_code,lease=null,lease_until=null,available_at=now()+least(16,power(2,attempts)::int)*interval '1 minute' where id=p_id;
  if p_code between 200 and 299 then update public.reminders set delivery_status='delivered',last_delivered_at=now() where id=j.reminder_id; end if;
  if exists(select 1 from planora_push.outbox where id=p_id and status='failed') then update public.reminders set delivery_status='failed' where id=j.reminder_id and delivery_status<>'delivered'; end if;
end;
$$;
revoke all on function public.finish_push_job(uuid,uuid,int) from public, anon, authenticated;
grant execute on function public.finish_push_job(uuid,uuid,int) to service_role;
