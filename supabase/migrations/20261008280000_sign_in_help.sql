-- After a failed sign-in: is this an approved email that hasn't created its account yet?
-- Lets the sign-in screen say "create your account first" instead of "wrong password".
-- (It tells someone whether an email is approved but not yet set up; nothing else.)
create function public.needs_account(p_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members where email = lower(trim(p_email)) and user_id is null)
$$;
revoke execute on function public.needs_account(text) from public;
grant execute on function public.needs_account(text) to anon, authenticated;
