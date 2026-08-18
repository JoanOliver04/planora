-- Remember the last complete/uncomplete so an older offline complete
-- cannot resurrect a newer online uncomplete.

create table public.task_occurrence_state (
  task_id uuid not null,
  user_id uuid not null,
  occurrence_date date not null,
  last_action text not null check (last_action in ('complete', 'uncomplete')),
  changed_at timestamptz not null default pg_catalog.now(),
  primary key (task_id, occurrence_date),
  foreign key (user_id) references public.profiles(id) on delete cascade,
  foreign key (task_id, user_id) references public.tasks(id, user_id) on delete cascade
);

create index task_occurrence_state_user_idx
  on public.task_occurrence_state(user_id, changed_at desc);

alter table public.task_occurrence_state enable row level security;
revoke all on table public.task_occurrence_state from anon;
grant select, insert, update on table public.task_occurrence_state to authenticated;

create policy occurrence_state_select on public.task_occurrence_state
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy occurrence_state_insert on public.task_occurrence_state
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy occurrence_state_update on public.task_occurrence_state
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.record_completion_occurrence_state()
returns trigger
language plpgsql
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

create trigger task_completions_occurrence_state
after insert or delete on public.task_completions
for each row execute function public.record_completion_occurrence_state();

-- Replay existing completions so the first flush already has authority.
insert into public.task_occurrence_state(
  task_id, user_id, occurrence_date, last_action, changed_at
)
select task_id, user_id, occurrence_date, 'complete', completed_at
from public.task_completions
on conflict (task_id, occurrence_date) do nothing;

create or replace function public.restore_planora_backup(backup_data jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  restored jsonb;
  current_user_id uuid := auth.uid();
begin
  perform set_config('planora.restoring', 'on', true);
  delete from public.task_occurrence_state where user_id = current_user_id;
  restored := public.restore_planora_backup_core(backup_data);

  perform public.restore_category_scope(
    coalesce(backup_data->'categories', '[]'::jsonb),
    current_user_id
  );

  update public.tasks as task
  set focus_enabled = coalesce(source.focus_enabled, false)
  from jsonb_to_recordset(coalesce(backup_data->'tasks', '[]'::jsonb))
    as source(id uuid, focus_enabled boolean)
  where task.id = source.id
    and task.user_id = current_user_id;

  update public.focus_sessions
  set
    status = 'cancelled',
    ended_at = coalesce(ended_at, started_at),
    current_phase_kind = null
  where user_id = current_user_id
    and status in ('running', 'paused', 'on_break');

  update public.focus_intervals
  set ended_at = coalesce(ended_at, started_at)
  where user_id = current_user_id
    and ended_at is null;

  return restored;
end
$$;

revoke all on function public.restore_planora_backup(jsonb) from public;
grant execute on function public.restore_planora_backup(jsonb) to authenticated;
