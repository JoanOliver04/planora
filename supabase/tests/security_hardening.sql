-- Run ONLY against an isolated local database after all migrations:
-- psql -X -v ON_ERROR_STOP=1 -f supabase/tests/security_hardening.sql
-- Requires postgres/test-administrator access for fixture setup and SET ROLE.
-- All fixtures and helper functions are rolled back at the end.
\set ON_ERROR_STOP on
begin;

create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is distinct from true then raise exception 'Assertion failed: %', message; end if;
end
$$;

select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.handle_new_user()', 'execute')
  and not has_function_privilege('authenticated', 'public.handle_new_user()', 'execute'),
  'Profile bootstrap must not be a client RPC'
);
insert into auth.users(id, raw_user_meta_data)
values ('10000000-0000-4000-8000-000000000009', '{}'::jsonb);
select pg_temp.assert_true(
  exists(select 1 from public.profiles where id = '10000000-0000-4000-8000-000000000009'),
  'Auth service signup must still bootstrap a profile'
);

create function pg_temp.assert_rejected(command text, expected_state text)
returns void language plpgsql as $$
declare
  caught_state text;
begin
  begin
    execute command;
  exception when others then
    get stacked diagnostics caught_state = returned_sqlstate;
  end;
  perform pg_temp.assert_true(caught_state = expected_state,
    'Expected SQLSTATE ' || expected_state || ', received ' || coalesce(caught_state, 'success'));
end
$$;

insert into auth.users(id, raw_user_meta_data) values
  ('10000000-0000-4000-8000-000000000001', '{}'::jsonb),
  ('10000000-0000-4000-8000-000000000002', '{}'::jsonb),
  ('10000000-0000-4000-8000-000000000003', '{}'::jsonb),
  ('10000000-0000-4000-8000-000000000004', '{}'::jsonb),
  ('10000000-0000-4000-8000-000000000005', '{}'::jsonb);
insert into public.schedules(id, user_id, name) values
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Original private schedule'),
  ('a0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Other private schedule');
update public.profiles set active_schedule_id = 'a0000000-0000-4000-8000-000000000001'
where id = '10000000-0000-4000-8000-000000000001';

create temporary table security_test_state(key text primary key, value jsonb not null);
grant all on table security_test_state to authenticated;
insert into security_test_state values
  ('original_schedule', (select to_jsonb(s) from public.schedules s where id = 'a0000000-0000-4000-8000-000000000001')),
  ('original_profile', (select to_jsonb(p) from public.profiles p where id = '10000000-0000-4000-8000-000000000001')),
  ('other_schedule', (select to_jsonb(s) from public.schedules s where id = 'a0000000-0000-4000-8000-000000000002')),
  ('valid_backup', jsonb_build_object('schedules', jsonb_build_array(jsonb_build_object(
    'id', 'b0000000-0000-4000-8000-000000000001',
    'name', 'Restored schedule', 'description', null, 'emoji', null,
    'is_archived', false, 'sort_order', 0
  ))));

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

-- Owner policies cover reads, mutations, ownership transfer and internal RPCs.
select pg_temp.assert_true((select count(*) = 0 from public.schedules
  where id = 'a0000000-0000-4000-8000-000000000002'), 'Foreign schedule must be invisible');
with changed as (
  update public.schedules set name = 'Stolen' where id = 'a0000000-0000-4000-8000-000000000002' returning id
) select pg_temp.assert_true((select count(*) = 0 from changed), 'Foreign schedule update must affect no rows');
select pg_temp.assert_rejected($command$
  insert into public.schedules(user_id, name)
  values ('10000000-0000-4000-8000-000000000002', 'Foreign insert')
$command$, '42501');
select pg_temp.assert_rejected($command$
  update public.schedules set user_id = '10000000-0000-4000-8000-000000000002'
  where id = 'a0000000-0000-4000-8000-000000000001'
$command$, '42501');
select pg_temp.assert_rejected('select public.restore_planora_backup_core(''{}''::jsonb)', '42501');
select pg_temp.assert_rejected('select public.restore_category_scope(''[]''::jsonb, auth.uid())', '42501');

-- Attempt 1: invalid root. Attempts 2/3: oversized input and a late NOT NULL
-- failure after the core has already deleted/recreated workspace resources.
select pg_temp.assert_true(public.restore_planora_backup(null) =
  '{"ok":false,"error":"INVALID_BACKUP"}'::jsonb, 'Null root must fail normally');
select pg_temp.assert_true(public.restore_planora_backup(jsonb_build_object('padding', repeat('x', 5242880))) =
  '{"ok":false,"error":"INVALID_BACKUP"}'::jsonb, 'Oversized payload must consume a failed attempt');
select pg_temp.assert_true(public.restore_planora_backup(
  (select value from security_test_state where key = 'valid_backup') ||
  jsonb_build_object('templates', jsonb_build_array(jsonb_build_object(
    'id', 'c0000000-0000-4000-8000-000000000001', 'name', 'Invalid late template', 'content', null
  )))
) = '{"ok":false,"error":"INVALID_BACKUP"}'::jsonb, 'Late insert failure must be contained');

-- Attempt 4: this profile relationship is initially deferred. It must fail
-- within the restore savepoint, not later at outer transaction commit.
set constraints all deferred;
select pg_temp.assert_true(public.restore_planora_backup(
  (select value from security_test_state where key = 'valid_backup') ||
  jsonb_build_object('profile', jsonb_build_object(
    'locale', 'es', 'timezone', 'Europe/Madrid', 'theme', 'system', 'week_starts_on', 1,
    'active_schedule_id', 'a0000000-0000-4000-8000-000000000002'
  ))
) = '{"ok":false,"error":"INVALID_BACKUP"}'::jsonb, 'Deferred foreign-owner FK must fail within savepoint');

select pg_temp.assert_true((select to_jsonb(s) = (select value from security_test_state where key = 'original_schedule')
  from public.schedules s where id = 'a0000000-0000-4000-8000-000000000001'), 'Failed restore must preserve original schedule exactly');
select pg_temp.assert_true((select to_jsonb(p) = (select value from security_test_state where key = 'original_profile')
  from public.profiles p where id = auth.uid()), 'Failed restore must preserve original profile exactly');
reset role;
select pg_temp.assert_true((select request_count = 4 from public.request_rate_limits
  where key_hash = encode(extensions.digest('backup-restore-rpc:10000000-0000-4000-8000-000000000001', 'sha256'), 'hex')),
  'All four failed attempts must retain their quota increments');

set local role authenticated;
-- Attempt 5: existing count keys remain available beside the success marker.
insert into security_test_state values ('success', public.restore_planora_backup(
  (select value from security_test_state where key = 'valid_backup')
));
select pg_temp.assert_true((select value->>'ok' = 'true' and value->>'schedules' = '1'
  and value->>'tasks' = '0' and value->>'focus_intervals' = '0'
  from security_test_state where key = 'success'), 'Valid restore must return success and exact counts');
select pg_temp.assert_true((select name = 'Restored schedule' from public.schedules
  where id = 'b0000000-0000-4000-8000-000000000001'), 'Valid restore must persist the imported workspace');
select pg_temp.assert_true(public.restore_planora_backup('{}'::jsonb) =
  '{"ok":false,"error":"RATE_LIMITED"}'::jsonb, 'Sixth restore must be denied');
select pg_temp.assert_true((select count(*) = 1 from public.schedules), 'Denied restore must not delete workspace');
reset role;
select pg_temp.assert_true((select request_count = 6 from public.request_rate_limits
  where key_hash = encode(extensions.digest('backup-restore-rpc:10000000-0000-4000-8000-000000000001', 'sha256'), 'hex')),
  'Denied attempts must persist accounting too');
select pg_temp.assert_true(not exists(select 1 from public.request_rate_limits
  where key_hash = encode(extensions.digest('backup-restore:10000000-0000-4000-8000-000000000001', 'sha256'), 'hex')),
  'RPC gate must not double-charge the Server Action key');
select pg_temp.assert_true((select to_jsonb(s) = (select value from security_test_state where key = 'other_schedule')
  from public.schedules s where id = 'a0000000-0000-4000-8000-000000000002'), 'Other account must remain unchanged');

set local role authenticated;
-- Direct REST-equivalent writes cannot bypass JSON shape/byte limits.
select pg_temp.assert_rejected($command$
  update public.profiles set preferences = jsonb_build_object('x', repeat('x', 16384)) where id = auth.uid()
$command$, '23514');
select pg_temp.assert_rejected($command$
  update public.profiles set day_part_settings = '[]'::jsonb where id = auth.uid()
$command$, '23514');
select pg_temp.assert_rejected($command$
  insert into public.schedule_templates(user_id, name, content)
  values (auth.uid(), 'Too large', jsonb_build_object('x', repeat('x', 262144)))
$command$, '23514');
insert into public.tasks(id, user_id, scope, title, task_kind, recurrence_type, start_date)
values ('d0000000-0000-4000-8000-000000000001', auth.uid(), 'global', 'Bounded task', 'habit', 'daily', current_date);
select pg_temp.assert_rejected($command$
  update public.tasks set recurrence_config = jsonb_build_object('x', repeat('x', 8192))
  where id = 'd0000000-0000-4000-8000-000000000001'
$command$, '23514');
select pg_temp.assert_rejected($command$
  insert into public.focus_presets(user_id, name, mode, segments)
  values (auth.uid(), 'Too many segments', 'stopwatch',
    (select jsonb_agg('{}'::jsonb) from generate_series(1, 41)))
$command$, '23514');
select pg_temp.assert_rejected($command$
  insert into public.focus_presets(user_id, name, mode, segments)
  values (auth.uid(), 'Too large segments', 'stopwatch', jsonb_build_array(repeat('x', 65536)))
$command$, '23514');
insert into public.focus_sessions(id, user_id, status, mode, current_phase_kind)
values ('e0000000-0000-4000-8000-000000000001', auth.uid(), 'running', 'stopwatch', 'focus');
select pg_temp.assert_rejected($command$
  update public.focus_sessions set config = jsonb_build_object('x', repeat('x', 65536))
  where id = 'e0000000-0000-4000-8000-000000000001'
$command$, '23514');
select pg_temp.assert_rejected($command$
  update public.focus_sessions set link_snapshot = jsonb_build_object('x', repeat('x', 16384))
  where id = 'e0000000-0000-4000-8000-000000000001'
$command$, '23514');
select pg_temp.assert_rejected($command$
  update public.focus_sessions set distractions = '[{}]'::jsonb
  where id = 'e0000000-0000-4000-8000-000000000001'
$command$, '23514');
select pg_temp.assert_rejected($command$
  update public.focus_sessions set distractions = jsonb_build_array(repeat('x', 281))
  where id = 'e0000000-0000-4000-8000-000000000001'
$command$, '23514');
select pg_temp.assert_rejected($command$
  update public.focus_sessions set distractions = (select jsonb_agg('"x"'::jsonb) from generate_series(1, 51))
  where id = 'e0000000-0000-4000-8000-000000000001'
$command$, '23514');
update public.focus_sessions set distractions = jsonb_build_array(repeat('x', 280))
where id = 'e0000000-0000-4000-8000-000000000001';

-- Quota checks work for bulk statements, reject the entire excess insert and
-- allow insertion again after freeing space. Existing owner indexes serve counts.
insert into public.schedules(user_id, name)
select auth.uid(), 'Quota schedule ' || value from generate_series(1, 199) value;
select pg_temp.assert_rejected($command$
  insert into public.schedules(user_id, name) values (auth.uid(), 'Above quota')
$command$, '23514');
select pg_temp.assert_true((select count(*) = 200 from public.schedules), 'Owner schedule quota must be atomic');
delete from public.schedules where name = 'Quota schedule 1';
insert into public.schedules(user_id, name) values (auth.uid(), 'Released capacity');
select pg_temp.assert_true((select count(*) = 200 from public.schedules), 'Freed capacity must be reusable');
insert into public.focus_goals(user_id, target_focus_sec, timezone)
select auth.uid(), 60, 'Europe/Madrid' from generate_series(1, 50);
select pg_temp.assert_rejected($command$
  insert into public.focus_goals(user_id, target_focus_sec, timezone)
  values (auth.uid(), 60, 'Europe/Madrid')
$command$, '23514');

-- Internal receipt/tombstone tables are also exposed to authenticated writers.
select pg_temp.assert_rejected($command$
  insert into public.template_imports(request_id, user_id, template_key, schedule_id)
  values (gen_random_uuid(), auth.uid(), repeat('x', 161), 'b0000000-0000-4000-8000-000000000001')
$command$, '23514');
insert into public.template_imports(request_id, user_id, template_key, schedule_id)
select gen_random_uuid(), auth.uid(), 'bounded-receipt', 'b0000000-0000-4000-8000-000000000001'
from generate_series(1, 5000);
select pg_temp.assert_rejected($command$
  insert into public.template_imports(request_id, user_id, template_key, schedule_id)
  values (gen_random_uuid(), auth.uid(), 'over-quota', 'b0000000-0000-4000-8000-000000000001')
$command$, '23514');
select pg_temp.assert_rejected($command$
  insert into public.template_imports(request_id, user_id, template_key, schedule_id)
  values (gen_random_uuid(), '10000000-0000-4000-8000-000000000002', 'foreign', 'b0000000-0000-4000-8000-000000000001')
$command$, '42501');

update public.tasks set start_date = current_date - 20001
where id = 'd0000000-0000-4000-8000-000000000001';
insert into public.task_completions(user_id, task_id, occurrence_date, task_snapshot)
values (auth.uid(), 'd0000000-0000-4000-8000-000000000001', current_date - 1, '{}');
insert into public.task_occurrence_state(task_id, user_id, occurrence_date, last_action)
select 'd0000000-0000-4000-8000-000000000001', auth.uid(), current_date - value, 'uncomplete'
from generate_series(2, 20000) value;
select pg_temp.assert_rejected($command$
  insert into public.task_occurrence_state(task_id, user_id, occurrence_date, last_action)
  values ('d0000000-0000-4000-8000-000000000001', auth.uid(), current_date - 20001, 'uncomplete')
$command$, '23514');
select pg_temp.assert_rejected($command$
  insert into public.task_occurrence_state(task_id, user_id, occurrence_date, last_action)
  values ('d0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', current_date, 'uncomplete')
$command$, '42501');
select pg_temp.assert_rejected($command$
  insert into public.task_completions(user_id, task_id, occurrence_date, task_snapshot)
  values (auth.uid(), 'd0000000-0000-4000-8000-000000000001', current_date - 20001, '{}')
$command$, '23514');
delete from public.task_completions where task_id = 'd0000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select count(*) = 20000 from public.task_occurrence_state),
  'Uncomplete at capacity must reuse its existing tombstone');

reset role;
set local role anon;
select pg_temp.assert_rejected('select public.restore_planora_backup(''{}''::jsonb)', '42501');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
-- A legitimate portable backup must still disable reminders and terminalize
-- live Focus state while preserving exact per-entity restoration counts.
insert into security_test_state values ('focus_success', public.restore_planora_backup(jsonb_build_object(
  'reminders', jsonb_build_array(jsonb_build_object(
    'id', 'f0000000-0000-4000-8000-000000000001', 'kind', 'daily_summary',
    'recurrence', 'daily', 'time_of_day', '09:00', 'timezone', 'Europe/Madrid',
    'next_trigger_at', now()
  )),
  'focus_sessions', jsonb_build_array(jsonb_build_object(
    'id', 'f0000000-0000-4000-8000-000000000002', 'status', 'running', 'mode', 'stopwatch',
    'focus_sec', 0, 'paused_sec', 0, 'break_sec', 0, 'current_phase_kind', 'focus',
    'current_cycle', 1, 'started_at', now(), 'complete_task_on_end', false,
    'task_completion_applied', false
  )),
  'focus_intervals', jsonb_build_array(jsonb_build_object(
    'id', 'f0000000-0000-4000-8000-000000000003',
    'session_id', 'f0000000-0000-4000-8000-000000000002',
    'kind', 'focus', 'sequence', 0, 'started_at', now()
  ))
)));
select pg_temp.assert_true((select value->>'ok' = 'true' and value->>'reminders' = '1'
  and value->>'focus_sessions' = '1' and value->>'focus_intervals' = '1'
  from security_test_state where key = 'focus_success'), 'Focus/reminder restore must retain exact counts');
select pg_temp.assert_true((select not enabled and delivery_status = 'pending' from public.reminders
  where id = 'f0000000-0000-4000-8000-000000000001'), 'Restored reminders must be disabled');
select pg_temp.assert_true((select status = 'cancelled' and ended_at is not null and current_phase_kind is null
  from public.focus_sessions where id = 'f0000000-0000-4000-8000-000000000002'), 'Restored live Focus must become terminal');
select pg_temp.assert_true((select ended_at is not null from public.focus_intervals
  where id = 'f0000000-0000-4000-8000-000000000003'), 'Restored open interval must be closed');

-- Lock-order changes preserve onboarding, retry idempotence and deletion RPCs.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
insert into security_test_state values ('onboarding', to_jsonb(public.complete_onboarding(true, 'Europe/Madrid')));
select pg_temp.assert_true(to_jsonb(public.complete_onboarding(true, 'Europe/Madrid')) =
  (select value from security_test_state where key = 'onboarding'), 'Basic onboarding retry must be idempotent');
select pg_temp.assert_true((select count(*) = 1 from public.schedules) and
  (select count(*) = 4 from public.categories), 'Basic onboarding must create its normal starter resources');
insert into public.tasks(id, user_id, schedule_id, title, task_kind, recurrence_type, start_date, archived_at)
select 'd0000000-0000-4000-8000-000000000003', auth.uid(), active_schedule_id,
  'Archived task', 'habit', 'daily', current_date - 2, now() from public.profiles where id = auth.uid();
insert into public.task_completions(user_id, task_id, occurrence_date, task_snapshot)
values (auth.uid(), 'd0000000-0000-4000-8000-000000000003', current_date - 1, '{}');
select pg_temp.assert_true(public.delete_archived_task('d0000000-0000-4000-8000-000000000003'),
  'Archived-task deletion must still remove completion history atomically');
select pg_temp.assert_true((select count(*) = 0 from public.task_occurrence_state), 'Archived-task deletion must remove its tombstones');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
insert into security_test_state values ('guided_onboarding', to_jsonb(public.complete_guided_onboarding(
  'studies', 'Learning', 'Europe/Madrid', 1, '#4F6B45', false
)));
select pg_temp.assert_true(to_jsonb(public.complete_guided_onboarding(
  'studies', 'Learning', 'Europe/Madrid', 1, '#4F6B45', false
)) = (select value from security_test_state where key = 'guided_onboarding'), 'Guided onboarding retry must be idempotent');
select pg_temp.assert_true((select count(*) = 1 from public.schedules) and
  (select count(*) = 2 from public.categories), 'Guided onboarding must create its normal starter resources');
insert into public.tasks(id, user_id, schedule_id, title, task_kind, recurrence_type, start_date)
select 'd0000000-0000-4000-8000-000000000004', auth.uid(), active_schedule_id,
  'Schedule task', 'habit', 'daily', current_date - 1 from public.profiles where id = auth.uid();
insert into public.task_completions(user_id, task_id, occurrence_date, task_snapshot)
values (auth.uid(), 'd0000000-0000-4000-8000-000000000004', current_date - 1, '{}');
select public.delete_schedule((select (value #>> '{}')::uuid from security_test_state where key = 'guided_onboarding'));
select pg_temp.assert_true((select count(*) = 0 from public.schedules) and
  (select count(*) = 0 from public.tasks) and (select count(*) = 0 from public.task_occurrence_state),
  'Schedule deletion must still remove tasks, completions and tombstones');
reset role;

-- Trusted bootstrap simulates a deployment whose history already exceeds the
-- new cap. Users must be able to reduce that excess one deletion at a time.
select set_config('request.jwt.claim.sub', '', true);
insert into public.tasks(id, user_id, scope, title, task_kind, recurrence_type, start_date)
values ('d0000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005',
  'global', 'Legacy history', 'habit', 'daily', current_date - 20003);
insert into public.task_completions(user_id, task_id, occurrence_date, task_snapshot)
select '10000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000005',
  current_date - value, '{}'::jsonb from generate_series(1, 20002) value;
delete from public.task_occurrence_state where task_id = 'd0000000-0000-4000-8000-000000000005'
  and occurrence_date = current_date - 20002;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);
delete from public.task_completions where task_id = 'd0000000-0000-4000-8000-000000000005'
  and occurrence_date = current_date - 1;
select pg_temp.assert_true((select count(*) = 20001 from public.task_completions) and
  (select count(*) = 20001 from public.task_occurrence_state),
  'Legacy over-capacity history must allow reductions while still above the new quota');
select pg_temp.assert_rejected($command$
  delete from public.task_completions where task_id = 'd0000000-0000-4000-8000-000000000005'
    and occurrence_date = current_date - 20002
$command$, '23514');
select pg_temp.assert_true((select count(*) = 20001 from public.task_completions) and
  (select count(*) = 20001 from public.task_occurrence_state),
  'An undo must not grow legacy excess by recreating a missing tombstone');
delete from public.task_completions where task_id = 'd0000000-0000-4000-8000-000000000005'
  and occurrence_date = current_date - 2;
select pg_temp.assert_true((select count(*) = 20000 from public.task_completions),
  'Repeated cleanup must reach the completion quota without deleting all history at once');
select pg_temp.assert_rejected($command$
  insert into public.task_occurrence_state(task_id, user_id, occurrence_date, last_action)
  values ('d0000000-0000-4000-8000-000000000005', auth.uid(), current_date - 20003, 'uncomplete')
$command$, '23514');
reset role;
select 'security_hardening.sql: all assertions passed' as result;
rollback;
