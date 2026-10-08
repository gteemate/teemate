-- 1. Admins can delete a member (not themselves, not the last admin). Their login goes too, and
--    their bookings, guest points, buddies and the scorecards they created are removed with them.
-- 2. Every game is available: players choose. Clear any club on/off switches and allowance overrides.

create function public.admin_delete_member(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can delete members.' using errcode = '42501';
  end if;
  if p_id = public.current_member_id() then
    raise exception 'You can''t delete yourself.' using errcode = 'P0001';
  end if;
  if (select admin from public.members where id = p_id) and (select count(*) from public.members where admin) <= 1 then
    raise exception 'You can''t delete the last admin.' using errcode = 'P0001';
  end if;
  select user_id into v_user from public.members where id = p_id;
  delete from public.members where id = p_id;
  if v_user is not null then
    delete from auth.users where id = v_user;
  end if;
end $$;
revoke execute on function public.admin_delete_member(bigint) from public, anon;
grant execute on function public.admin_delete_member(bigint) to authenticated;

delete from public.game_settings;
