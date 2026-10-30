-- Profile bootstrap is a trigger, not a client-callable RPC. Existing triggers
-- continue to run under their owner; public callers need no EXECUTE grant.
revoke all on function public.handle_new_user() from public, anon, authenticated;
