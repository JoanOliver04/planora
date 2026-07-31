-- Cover the user-scoped ordering used by workspace list queries. These keep
-- response time stable as an account accumulates tasks and schedules.
create index if not exists tasks_user_sort_created_idx
  on public.tasks(user_id, sort_order, created_at);

create index if not exists schedules_user_created_idx
  on public.schedules(user_id, created_at);
