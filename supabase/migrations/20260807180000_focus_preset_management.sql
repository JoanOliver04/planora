-- Focus preset management: emoji, intention, default category, archive, reorder.

alter table public.focus_presets
  add column if not exists emoji text
    check (emoji is null or char_length(emoji) between 1 and 16),
  add column if not exists intention text
    check (intention is null or char_length(intention) between 1 and 140),
  add column if not exists default_category_id uuid,
  add column if not exists archived_at timestamptz;

alter table public.focus_presets
  drop constraint if exists focus_presets_default_category_owner_fk;

alter table public.focus_presets
  add constraint focus_presets_default_category_owner_fk
  foreign key (default_category_id, user_id)
  references public.categories (id, user_id)
  on delete set null;

create index if not exists focus_presets_user_active_sort_idx
  on public.focus_presets (user_id, sort_order, created_at)
  where archived_at is null;

create index if not exists focus_presets_user_archived_idx
  on public.focus_presets (user_id, archived_at desc)
  where archived_at is not null;

comment on column public.focus_presets.emoji is
  'Optional display emoji for the preset card.';
comment on column public.focus_presets.intention is
  'Suggested session title/intention when starting from this preset.';
comment on column public.focus_presets.default_category_id is
  'Optional default category ownership-safe FK for new sessions.';
comment on column public.focus_presets.archived_at is
  'Soft-archive timestamp; null means active.';

-- Extend reorder_resources to include focus presets.
create or replace function public.reorder_resources(resource_type text, ordered_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owned_count integer;
  requested_count integer;
begin
  requested_count := coalesce(array_length(ordered_ids, 1), 0);
  if requested_count = 0 or requested_count > 500
    or requested_count <> (select count(distinct value) from unnest(ordered_ids) value)
  then raise exception 'Invalid order'; end if;

  if resource_type = 'tasks' then
    select count(*) into owned_count
    from public.tasks
    where user_id = auth.uid() and id = any(ordered_ids);
    if owned_count <> requested_count then raise exception 'Resource ownership mismatch'; end if;
    update public.tasks item set sort_order = ordering.position
    from (
      select id, ordinality::integer as position
      from unnest(ordered_ids) with ordinality as value(id, ordinality)
    ) ordering
    where item.id = ordering.id and item.user_id = auth.uid();

  elsif resource_type = 'categories' then
    select count(*) into owned_count
    from public.categories
    where user_id = auth.uid() and id = any(ordered_ids);
    if owned_count <> requested_count then raise exception 'Resource ownership mismatch'; end if;
    update public.categories item set sort_order = ordering.position
    from (
      select id, ordinality::integer as position
      from unnest(ordered_ids) with ordinality as value(id, ordinality)
    ) ordering
    where item.id = ordering.id and item.user_id = auth.uid();

  elsif resource_type = 'schedules' then
    select count(*) into owned_count
    from public.schedules
    where user_id = auth.uid() and id = any(ordered_ids);
    if owned_count <> requested_count then raise exception 'Resource ownership mismatch'; end if;
    update public.schedules item set sort_order = ordering.position
    from (
      select id, ordinality::integer as position
      from unnest(ordered_ids) with ordinality as value(id, ordinality)
    ) ordering
    where item.id = ordering.id and item.user_id = auth.uid();

  elsif resource_type = 'focus_presets' then
    select count(*) into owned_count
    from public.focus_presets
    where user_id = auth.uid() and id = any(ordered_ids) and archived_at is null;
    if owned_count <> requested_count then raise exception 'Resource ownership mismatch'; end if;
    update public.focus_presets item set sort_order = ordering.position
    from (
      select id, ordinality::integer as position
      from unnest(ordered_ids) with ordinality as value(id, ordinality)
    ) ordering
    where item.id = ordering.id and item.user_id = auth.uid();

  else
    raise exception 'Invalid resource type';
  end if;
end
$$;

revoke all on function public.reorder_resources(text, uuid[]) from public;
grant execute on function public.reorder_resources(text, uuid[]) to authenticated;
