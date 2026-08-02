alter table public.categories
  add column schedule_id uuid null;

alter table public.categories
  add constraint categories_schedule_owner_fk
  foreign key (schedule_id, user_id)
  references public.schedules(id, user_id)
  on delete cascade;

create index categories_user_schedule_order_idx
  on public.categories(user_id, schedule_id, sort_order);

-- Preserve category scope when restoring new backups. Older backups omit the
-- field and therefore remain backwards-compatible as global categories.
create or replace function public.restore_category_scope(
  categories_data jsonb,
  current_user_id uuid
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.categories category
  set schedule_id = source.schedule_id
  from jsonb_to_recordset(categories_data) as source(id uuid, schedule_id uuid)
  where category.id = source.id and category.user_id = current_user_id;
end
$$;

revoke all on function public.restore_category_scope(jsonb, uuid) from public;
grant execute on function public.restore_category_scope(jsonb, uuid) to authenticated;

alter function public.restore_planora_backup(jsonb)
  rename to restore_planora_backup_core;

revoke all on function public.restore_planora_backup_core(jsonb) from public;
revoke all on function public.restore_planora_backup_core(jsonb) from authenticated;
grant execute on function public.restore_planora_backup_core(jsonb) to authenticated;

create function public.restore_planora_backup(backup_data jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  restored jsonb;
begin
  restored := public.restore_planora_backup_core(backup_data);
  perform public.restore_category_scope(
    coalesce(backup_data->'categories', '[]'::jsonb),
    auth.uid()
  );
  return restored;
end
$$;

revoke all on function public.restore_planora_backup(jsonb) from public;
grant execute on function public.restore_planora_backup(jsonb) to authenticated;
