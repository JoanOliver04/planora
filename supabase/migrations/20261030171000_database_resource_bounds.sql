-- Defense in depth for direct PostgREST writes. NOT VALID avoids scanning or
-- rejecting existing deployments; new rows and future updates are checked.
alter table public.profiles
  add constraint profiles_day_parts_bound check (
    jsonb_typeof(day_part_settings) = 'object'
    and octet_length(day_part_settings::text) <= 16384
  ) not valid,
  add constraint profiles_preferences_bound check (
    jsonb_typeof(preferences) = 'object'
    and octet_length(preferences::text) <= 16384
  ) not valid;

alter table public.tasks
  add constraint tasks_recurrence_bound check (
    jsonb_typeof(recurrence_config) = 'object'
    and octet_length(recurrence_config::text) <= 8192
  ) not valid;

alter table public.task_completions
  add constraint completions_snapshot_bound check (
    jsonb_typeof(task_snapshot) = 'object'
    and octet_length(task_snapshot::text) <= 16384
  ) not valid;

alter table public.schedule_templates
  add constraint templates_content_bound check (
    jsonb_typeof(content) = 'object'
    and octet_length(content::text) <= 262144
  ) not valid;

alter table public.template_imports
  add constraint template_imports_key_bound check (
    octet_length(template_key) between 1 and 160
  ) not valid;

alter table public.focus_presets
  add constraint focus_presets_segments_bound check (
    case when jsonb_typeof(segments) = 'array' then
      jsonb_array_length(segments) <= 40
      and octet_length(segments::text) <= 65536
    else false end
  ) not valid;

-- CHECK expressions cannot contain subqueries; this immutable helper validates
-- every distraction rather than accepting arbitrary nested JSON in the array.
create or replace function public.focus_distractions_within_bounds(items jsonb)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select case when jsonb_typeof(items) = 'array' then
    octet_length(items::text) <= 65536
    and jsonb_array_length(items) <= 50
    and not exists (
      select 1 from jsonb_array_elements(items) as entry(value)
      where jsonb_typeof(entry.value) <> 'string'
        or char_length(entry.value #>> '{}') > 280
    )
  else false end
$$;
revoke all on function public.focus_distractions_within_bounds(jsonb) from public, anon;
grant execute on function public.focus_distractions_within_bounds(jsonb) to authenticated, service_role;

alter table public.focus_sessions
  add constraint focus_sessions_config_bound check (
    jsonb_typeof(config) = 'object' and octet_length(config::text) <= 65536
  ) not valid,
  add constraint focus_sessions_link_snapshot_bound check (
    jsonb_typeof(link_snapshot) = 'object' and octet_length(link_snapshot::text) <= 16384
  ) not valid,
  add constraint focus_sessions_distractions_bound check (
    public.focus_distractions_within_bounds(distractions)
  ) not valid;

-- Use the established portable-backup maxima as storage quotas, including 50
-- goals (the editor's 10-goal UX limit must not invalidate existing backups).
-- Internal import receipts are limited to 5000 and completion/tombstone state to
-- 20000 per owner. These retained-state limits bound direct API storage abuse.
-- Serialize mutations with restore's same owner lock. Count once per statement,
-- so bulk restore remains linear rather than counting after every interval.
-- Trusted bootstrap/service-role work with no auth.uid() is exempt; anonymous
-- clients have neither table privileges nor a matching RLS ownership policy.
create or replace function public.enforce_workspace_insert_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  row_limit integer;
  row_count bigint;
  retained_state_limit bigint;
begin
  if current_user_id is null then return null; end if;
  if tg_table_schema <> 'public' then raise exception 'Invalid quota table'; end if;
  -- Completion row triggers upsert state once per row. The enclosing completion
  -- statement checks the state quota once after all row triggers have finished.
  if tg_table_name = 'task_occurrence_state' and pg_trigger_depth() > 1 then
    return null;
  end if;
  row_limit := case tg_table_name
    when 'profiles' then 0 -- lock only; profiles are created by trusted bootstrap
    when 'schedules' then 200
    when 'categories' then 500
    when 'tasks' then 5000
    when 'events' then 5000
    when 'task_completions' then 20000
    when 'schedule_templates' then 500
    when 'reminders' then 1000
    when 'focus_presets' then 200
    when 'focus_sessions' then 5000
    when 'focus_intervals' then 50000
    when 'focus_goals' then 50
    when 'template_imports' then 5000
    when 'task_occurrence_state' then 20000
    else null
  end;
  if row_limit is null then raise exception 'Invalid quota table'; end if;

  if tg_when = 'BEFORE' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(current_user_id::text, 7012026)
    );
    if tg_table_name = 'task_completions' and tg_op = 'DELETE' then
      select greatest(count(*), 20000) into retained_state_limit
      from public.task_occurrence_state where user_id = current_user_id;
      -- Always overwrite this transaction-local baseline under the owner lock.
      -- The matching AFTER DELETE trigger may preserve legacy excess state,
      -- but may not increase it by recreating previously missing tombstones.
      perform set_config('planora.completion_delete_state_limit', retained_state_limit::text, true);
    end if;
  else
    -- Existing deployments can exceed a newly introduced quota. DELETE must
    -- remain usable to reduce that excess rather than enforcing an INSERT cap.
    if tg_op = 'INSERT' then
      execute format('select count(*) from public.%I where user_id = $1', tg_table_name)
        into row_count using current_user_id;
      if row_count > row_limit then
        raise exception using errcode = '23514', message = 'Workspace resource limit exceeded';
      end if;
    end if;
    if tg_table_name = 'task_completions' then
      select count(*) into row_count from public.task_occurrence_state
      where user_id = current_user_id;
      retained_state_limit := case when tg_op = 'DELETE' then
        coalesce(nullif(current_setting('planora.completion_delete_state_limit', true), '')::bigint, 20000)
        else 20000 end;
      if row_count > retained_state_limit then
        raise exception using errcode = '23514', message = 'Workspace resource limit exceeded';
      end if;
    end if;
  end if;
  return null;
end
$$;
revoke all on function public.enforce_workspace_insert_quota() from public, anon, authenticated;

do $$
declare
  resource_table text;
begin
  foreach resource_table in array array[
    'schedules', 'categories', 'tasks', 'events', 'task_completions',
    'schedule_templates', 'reminders', 'focus_presets', 'focus_sessions',
    'focus_intervals', 'focus_goals', 'template_imports', 'task_occurrence_state'
  ] loop
    execute format(
      'create trigger workspace_quota_lock before insert or delete on public.%I for each statement execute function public.enforce_workspace_insert_quota()',
      resource_table
    );
    execute format(
      'create trigger workspace_quota_check after insert on public.%I for each statement execute function public.enforce_workspace_insert_quota()',
      resource_table
    );
  end loop;
end
$$;

-- Deleting completions creates tombstones. Lock before the delete takes row
-- locks, then check retained state after its row triggers have finished.
create trigger workspace_quota_after_completion_delete
after delete on public.task_completions
for each statement execute function public.enforce_workspace_insert_quota();

create trigger workspace_profile_mutation_lock
before delete on public.profiles
for each statement execute function public.enforce_workspace_insert_quota();
