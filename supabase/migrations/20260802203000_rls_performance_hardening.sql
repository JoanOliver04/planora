-- Preserve the existing ownership model while limiting policy evaluation to
-- authenticated sessions and caching auth.uid() once per statement.

alter policy schedules_select on public.schedules
  to authenticated using ((select auth.uid()) = user_id);
alter policy schedules_insert on public.schedules
  to authenticated with check ((select auth.uid()) = user_id);
alter policy schedules_update on public.schedules
  to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy schedules_delete on public.schedules
  to authenticated using ((select auth.uid()) = user_id);

alter policy categories_select on public.categories
  to authenticated using ((select auth.uid()) = user_id);
alter policy categories_insert on public.categories
  to authenticated with check ((select auth.uid()) = user_id);
alter policy categories_update on public.categories
  to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy categories_delete on public.categories
  to authenticated using ((select auth.uid()) = user_id);

alter policy tasks_select on public.tasks
  to authenticated using ((select auth.uid()) = user_id);
alter policy tasks_insert on public.tasks
  to authenticated with check ((select auth.uid()) = user_id);
alter policy tasks_update on public.tasks
  to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy tasks_delete on public.tasks
  to authenticated using ((select auth.uid()) = user_id);

alter policy completions_select on public.task_completions
  to authenticated using ((select auth.uid()) = user_id);
alter policy completions_insert on public.task_completions
  to authenticated with check ((select auth.uid()) = user_id);

alter policy completions_delete on public.task_completions
  to authenticated using ((select auth.uid()) = user_id);

alter policy events_select on public.events
  to authenticated using ((select auth.uid()) = user_id);
alter policy events_insert on public.events
  to authenticated with check ((select auth.uid()) = user_id);
alter policy events_update on public.events
  to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy events_delete on public.events
  to authenticated using ((select auth.uid()) = user_id);

alter policy profiles_select on public.profiles
  to authenticated using ((select auth.uid()) = id);
alter policy profiles_insert on public.profiles
  to authenticated with check ((select auth.uid()) = id);
alter policy profiles_update on public.profiles
  to authenticated using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
alter policy profiles_delete on public.profiles
  to authenticated using ((select auth.uid()) = id);

alter policy reminders_select on public.reminders
  to authenticated using ((select auth.uid()) = user_id);
alter policy reminders_insert on public.reminders
  to authenticated with check ((select auth.uid()) = user_id);
alter policy reminders_update on public.reminders
  to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy reminders_delete on public.reminders
  to authenticated using ((select auth.uid()) = user_id);

alter policy schedule_templates_select on public.schedule_templates
  to authenticated using ((select auth.uid()) = user_id);
alter policy schedule_templates_insert on public.schedule_templates
  to authenticated with check ((select auth.uid()) = user_id);
alter policy schedule_templates_update on public.schedule_templates
  to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy schedule_templates_delete on public.schedule_templates
  to authenticated using ((select auth.uid()) = user_id);

alter policy template_imports_select on public.template_imports
  to authenticated using ((select auth.uid()) = user_id);