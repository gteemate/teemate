-- One password, set once. Someone who isn't approved yet leaves their name with an access request
-- and creates their account (with their password) at the same time. Until an admin approves the
-- email they're signed in to nothing; once approved, they just sign in. Declining a request deletes
-- the waiting account.

-- Sign-up is allowed for approved emails, and for emails with a pending access request.
create or replace function public.hook_before_user_created(event jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(event->'user'->>'email');
begin
  if exists (select 1 from public.members where email = v_email)
     or exists (select 1 from public.access_requests where email = v_email) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'That email hasn''t been given access to TeeMate. Ask the club admin to add you.'));
end $$;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;

-- Is the signed-in login waiting for approval?
create function public.my_request_pending() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.access_requests where email = lower(auth.jwt()->>'email'))
$$;
revoke execute on function public.my_request_pending() from public, anon;
grant execute on function public.my_request_pending() to authenticated;

-- Declining also removes the waiting account (if it isn't linked to a member).
create or replace function public.admin_decline_request(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare v_email text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can manage access.' using errcode = '42501';
  end if;
  delete from public.access_requests where id = p_id returning email into v_email;
  if v_email is not null then
    delete from auth.users u where lower(u.email) = v_email
      and not exists (select 1 from public.members m where m.user_id = u.id);
  end if;
end $$;
