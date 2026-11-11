-- Auth account deletion cascades into completion history as supabase_auth_admin,
-- which deliberately has no grants on workspace tables. The trigger must run
-- with its owner's privileges, and must not recreate state for removed parents.
create or replace function public.record_completion_occurrence_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.task_occurrence_state as state(
      task_id, user_id, occurrence_date, last_action, changed_at
    ) values (
      new.task_id, new.user_id, new.occurrence_date, 'complete', pg_catalog.now()
    )
    on conflict (task_id, occurrence_date) do update
      set last_action = 'complete',
          changed_at = excluded.changed_at,
          user_id = excluded.user_id;
    return new;
  end if;

  -- A direct uncomplete keeps a tombstone for offline conflict resolution.
  -- Cascading task/profile deletion has no surviving occurrence to remember.
  if not exists (
    select 1 from public.profiles where id = old.user_id
  ) or not exists (
    select 1 from public.tasks where id = old.task_id and user_id = old.user_id
  ) then
    return old;
  end if;

  insert into public.task_occurrence_state as state(
    task_id, user_id, occurrence_date, last_action, changed_at
  ) values (
    old.task_id, old.user_id, old.occurrence_date, 'uncomplete', pg_catalog.now()
  )
  on conflict (task_id, occurrence_date) do update
    set last_action = 'uncomplete',
        changed_at = excluded.changed_at,
        user_id = excluded.user_id;
  return old;
end;
$$;

-- This is a row trigger, never an exposed client RPC. The completion table's
-- existing RLS and ownership foreign keys authorize the source rows.
revoke all on function public.record_completion_occurrence_state()
  from public, anon, authenticated;
