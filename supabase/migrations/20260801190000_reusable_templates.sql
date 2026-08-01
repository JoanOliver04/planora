create table public.schedule_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  emoji text check (char_length(emoji) <= 16),
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name)
);
create table public.template_imports (
  request_id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  template_key text not null,
  schedule_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (schedule_id, user_id) references public.schedules(id, user_id) on delete cascade
);
create index schedule_templates_user_idx on public.schedule_templates(user_id, created_at desc);
create index template_imports_user_idx on public.template_imports(user_id, created_at desc);
create trigger schedule_templates_updated before update on public.schedule_templates
for each row execute function public.set_updated_at();
alter table public.schedule_templates enable row level security;
alter table public.template_imports enable row level security;
create policy schedule_templates_select on public.schedule_templates for select using (user_id = auth.uid());
create policy schedule_templates_insert on public.schedule_templates for insert with check (user_id = auth.uid());
create policy schedule_templates_update on public.schedule_templates for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy schedule_templates_delete on public.schedule_templates for delete using (user_id = auth.uid());
create policy template_imports_select on public.template_imports for select using (user_id = auth.uid());

create or replace function public.save_personal_template(source_schedule_id uuid, template_name text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare template_id uuid; template_content jsonb; source_emoji text;
begin
  if template_name is null or char_length(trim(template_name)) not between 1 and 80 then
    raise exception 'Invalid template name';
  end if;
  select s.emoji,
    jsonb_build_object(
      'name', trim(template_name),
      'emoji', coalesce(s.emoji, '📋'),
      'categories', coalesce((
        select jsonb_agg(jsonb_build_object('key', c.id::text, 'name', c.name, 'colour', c.colour, 'emoji', c.emoji) order by c.sort_order, c.created_at)
        from public.categories c where c.user_id = auth.uid()
          and exists (select 1 from public.tasks t where t.user_id = auth.uid() and t.schedule_id = s.id and t.category_id = c.id)
      ), '[]'::jsonb),
      'tasks', coalesce((
        select jsonb_agg(jsonb_build_object(
          'title', t.title, 'emoji', t.emoji, 'categoryKey', t.category_id::text,
          'recurrence', t.recurrence_type, 'config', t.recurrence_config,
          'timeMode', t.time_mode, 'dayPart', t.day_part,
          'startTime', t.start_time, 'endTime', t.end_time
        ) order by t.sort_order, t.created_at)
        from public.tasks t where t.user_id = auth.uid() and t.schedule_id = s.id and t.archived_at is null
      ), '[]'::jsonb)
    )
  into source_emoji, template_content
  from public.schedules s where s.id = source_schedule_id and s.user_id = auth.uid();
  if template_content is null then raise exception 'Schedule not found'; end if;
  insert into public.schedule_templates(user_id, name, emoji, content)
  values (auth.uid(), trim(template_name), source_emoji, template_content)
  on conflict (user_id, name) do update set content = excluded.content, emoji = excluded.emoji
  returning id into template_id;
  return template_id;
end $$;

create or replace function public.import_schedule_template(
  request_id uuid,
  template_key text,
  template_content jsonb,
  include_categories boolean,
  include_tasks boolean
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  imported_schedule_id uuid;
  item jsonb;
  mapped_category_id uuid;
  category_map jsonb := '{}'::jsonb;
  category_key text;
  task_recurrence public.recurrence_type;
begin
  select schedule_id into imported_schedule_id from public.template_imports
  where template_imports.request_id = import_schedule_template.request_id and user_id = auth.uid();
  if imported_schedule_id is not null then return imported_schedule_id; end if;
  if template_content is null or jsonb_typeof(template_content) <> 'object'
    or char_length(template_content->>'name') not between 1 and 80
    or jsonb_array_length(coalesce(template_content->'categories', '[]'::jsonb)) > 30
    or jsonb_array_length(coalesce(template_content->'tasks', '[]'::jsonb)) > 100
  then raise exception 'Invalid template'; end if;

  insert into public.schedules(user_id, name, emoji)
  values (auth.uid(), template_content->>'name', left(coalesce(template_content->>'emoji', '📋'), 16))
  returning id into imported_schedule_id;

  if include_categories then
    for item in select value from jsonb_array_elements(coalesce(template_content->'categories', '[]'::jsonb))
    loop
      category_key := item->>'key';
      if category_key is null or char_length(item->>'name') not between 1 and 60
        or coalesce(item->>'colour', '') !~ '^#[0-9A-Fa-f]{6}$' then
        raise exception 'Invalid template category';
      end if;
      insert into public.categories(user_id, name, colour, emoji)
      values (auth.uid(), item->>'name', item->>'colour', left(item->>'emoji', 16))
      returning id into mapped_category_id;
      category_map := category_map || jsonb_build_object(category_key, mapped_category_id);
    end loop;
  end if;

  if include_tasks then
    for item in select value from jsonb_array_elements(coalesce(template_content->'tasks', '[]'::jsonb))
    loop
      if char_length(item->>'title') not between 1 and 140 then raise exception 'Invalid template task'; end if;
      task_recurrence := case when item->>'recurrence' in ('daily', 'weekdays', 'times_per_week', 'interval')
        then (item->>'recurrence')::public.recurrence_type else 'once'::public.recurrence_type end;
      category_key := item->>'categoryKey';
      mapped_category_id := null;
      if include_categories and category_key is not null and category_map ? category_key then
        mapped_category_id := (category_map->>category_key)::uuid;
      end if;
      insert into public.tasks(
        user_id, schedule_id, category_id, title, emoji, task_kind,
        recurrence_type, recurrence_config, time_mode, day_part,
        start_time, end_time, start_date
      ) values (
        auth.uid(), imported_schedule_id, mapped_category_id, item->>'title',
        left(item->>'emoji', 16), case when task_recurrence = 'once' then 'one_time'::public.task_kind else 'habit'::public.task_kind end,
        task_recurrence, coalesce(item->'config', '{}'::jsonb),
        case when item->>'timeMode' in ('day_part','specific_time','time_range') then (item->>'timeMode')::public.time_mode else 'anytime'::public.time_mode end,
        case when item->>'dayPart' in ('morning','afternoon','night') then (item->>'dayPart')::public.day_part else null end,
        nullif(item->>'startTime','')::time, nullif(item->>'endTime','')::time,
        current_date
      );
    end loop;
  end if;
  insert into public.template_imports(request_id, user_id, template_key, schedule_id)
  values (request_id, auth.uid(), left(template_key, 120), imported_schedule_id);
  update public.profiles set active_schedule_id = imported_schedule_id where id = auth.uid();
  return imported_schedule_id;
end $$;
