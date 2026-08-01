alter table public.schedules add column sort_order integer not null default 0;
create index schedules_user_order_idx on public.schedules(user_id, sort_order, created_at);

create or replace function public.reorder_resources(resource_type text, ordered_ids uuid[])
returns void language plpgsql security invoker set search_path = '' as $$
declare owned_count integer; requested_count integer;
begin
  requested_count := coalesce(array_length(ordered_ids, 1), 0);
  if requested_count = 0 or requested_count > 500
    or requested_count <> (select count(distinct value) from unnest(ordered_ids) value)
  then raise exception 'Invalid order'; end if;
  if resource_type = 'tasks' then
    select count(*) into owned_count from public.tasks where user_id = auth.uid() and id = any(ordered_ids);
    if owned_count <> requested_count then raise exception 'Resource ownership mismatch'; end if;
    update public.tasks item set sort_order = ordering.position
    from (select id, ordinality::integer as position from unnest(ordered_ids) with ordinality as value(id, ordinality)) ordering
    where item.id = ordering.id and item.user_id = auth.uid();
  elsif resource_type = 'categories' then
    select count(*) into owned_count from public.categories where user_id = auth.uid() and id = any(ordered_ids);
    if owned_count <> requested_count then raise exception 'Resource ownership mismatch'; end if;
    update public.categories item set sort_order = ordering.position
    from (select id, ordinality::integer as position from unnest(ordered_ids) with ordinality as value(id, ordinality)) ordering
    where item.id = ordering.id and item.user_id = auth.uid();
  elsif resource_type = 'schedules' then
    select count(*) into owned_count from public.schedules where user_id = auth.uid() and id = any(ordered_ids);
    if owned_count <> requested_count then raise exception 'Resource ownership mismatch'; end if;
    update public.schedules item set sort_order = ordering.position
    from (select id, ordinality::integer as position from unnest(ordered_ids) with ordinality as value(id, ordinality)) ordering
    where item.id = ordering.id and item.user_id = auth.uid();
  else raise exception 'Invalid resource type';
  end if;
end $$;
