-- Enforce completion invariants that cannot be trusted to the client.
create or replace function public.validate_task_completion() returns trigger language plpgsql set search_path=public as $$
declare current_task public.tasks%rowtype; weekly_target integer; weekly_count integer;
begin
 select * into current_task from public.tasks where id=new.task_id and user_id=new.user_id;
 if not found then raise exception 'Task not found'; end if;
 if new.occurrence_date < current_task.start_date or (current_task.end_date is not null and new.occurrence_date > current_task.end_date) then raise exception 'Occurrence outside task dates'; end if;
 if current_task.archived_at is not null and new.occurrence_date > (current_task.archived_at at time zone 'UTC')::date then raise exception 'Task is archived'; end if;
 if current_task.recurrence_type='once' and new.occurrence_date<>current_task.start_date then raise exception 'Invalid one-time occurrence'; end if;
 if current_task.recurrence_type='weekdays' and not (extract(dow from new.occurrence_date)::integer in (select jsonb_array_elements_text(current_task.recurrence_config->'weekdays')::integer)) then raise exception 'Invalid weekday occurrence'; end if;
 if current_task.recurrence_type='times_per_week' then
  weekly_target=(current_task.recurrence_config->>'target')::integer;
  select count(*) into weekly_count from public.task_completions where task_id=new.task_id and occurrence_date between date_trunc('week',new.occurrence_date::timestamp)::date and (date_trunc('week',new.occurrence_date::timestamp)::date+6);
  if weekly_count>=weekly_target then raise exception 'Weekly target already reached'; end if;
 end if;
 return new;
end $$;
create trigger task_completion_guard before insert on public.task_completions for each row execute function public.validate_task_completion();

create or replace function public.complete_onboarding(include_starters boolean, detected_timezone text) returns uuid language plpgsql security invoker set search_path=public as $$
declare schedule_id uuid; current_locale public.app_locale; names text[]; colours text[] := array['#7D9D74','#D48A57','#6C8CD5','#9877B5']; i integer;
begin
 select locale into current_locale from public.profiles where id=auth.uid() for update;
 if not found then raise exception 'Profile not found'; end if;
 insert into public.schedules(user_id,name,emoji) values(auth.uid(),'Normal','🌿') returning id into schedule_id;
 if include_starters then
  names := case when current_locale='es' then array['Higiene','Deporte','Estudios','Ocio'] else array['Hygiene','Sport','Studies','Entertainment'] end;
  for i in 1..4 loop insert into public.categories(user_id,name,colour,sort_order) values(auth.uid(),names[i],colours[i],i); end loop;
 end if;
 update public.profiles set active_schedule_id=schedule_id,onboarding_completed=true,timezone=detected_timezone where id=auth.uid();
 return schedule_id;
end $$;
