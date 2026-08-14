create table public.request_rate_limits (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  request_count integer not null check (request_count > 0),
  window_ends_at timestamptz not null
);

create index request_rate_limits_expiry_idx
  on public.request_rate_limits(window_ends_at);

alter table public.request_rate_limits enable row level security;
revoke all on table public.request_rate_limits from anon, authenticated;

create or replace function public.consume_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, retry_after integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
  current_window timestamptz;
begin
  if p_key_hash !~ '^[0-9a-f]{64}$'
    or p_limit < 1 or p_limit > 10000
    or p_window_seconds < 1 or p_window_seconds > 86400
  then raise exception 'Invalid rate limit input'; end if;

  delete from public.request_rate_limits
  where window_ends_at < pg_catalog.now() - interval '1 day';

  insert into public.request_rate_limits as limits(
    key_hash,
    request_count,
    window_ends_at
  ) values (
    p_key_hash,
    1,
    pg_catalog.now() + pg_catalog.make_interval(secs => p_window_seconds)
  )
  on conflict (key_hash) do update
  set request_count = case
        when limits.window_ends_at <= pg_catalog.now() then 1
        else limits.request_count + 1
      end,
      window_ends_at = case
        when limits.window_ends_at <= pg_catalog.now()
          then pg_catalog.now()
            + pg_catalog.make_interval(secs => p_window_seconds)
        else limits.window_ends_at
      end
  returning request_count, window_ends_at
  into current_count, current_window;

  return query select
    current_count <= p_limit,
    greatest(
      0,
      ceil(extract(epoch from current_window - pg_catalog.now()))::integer
    );
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer)
  to service_role;
