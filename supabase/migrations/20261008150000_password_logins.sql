-- Sign-in is now email + password, with no emails sent. An admin approves an email; that person
-- creates their own password the first time. The before-user-created hook still refuses any
-- email that hasn't been approved.

-- Reset a member's login (e.g. forgotten password): delete it but keep their email approved,
-- so they can create a new password. Their scores, bookings and history are kept.
create function public.admin_reset_login(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can manage access.' using errcode = '42501';
  end if;
  if p_id = public.current_member_id() then
    raise exception 'You can''t reset your own login here. Use Change password instead.' using errcode = 'P0001';
  end if;
  select user_id into v_user from public.members where id = p_id for update;
  if v_user is not null then
    update public.members set user_id = null where id = p_id;
    delete from auth.users where id = v_user;
  end if;
end $$;

revoke execute on function public.admin_reset_login(bigint) from public, anon;
grant execute on function public.admin_reset_login(bigint) to authenticated;
