-- Harden privileged trigger functions against search-path injection and
-- malformed identity-provider metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(id, display_name, avatar_url)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), 100),
    left(new.raw_user_meta_data->>'avatar_url', 2048)
  )
  on conflict do nothing;
  return new;
end
$$;

revoke all on function public.handle_new_user() from public;
