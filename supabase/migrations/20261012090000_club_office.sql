-- The club office: one login that runs the club (the iPad back office) and doesn't play. It's a members row marked
-- office (always an admin) so every admin rule already covers it; the app leaves it out of every player list.

alter table public.members add column office boolean not null default false;
alter table public.members add constraint members_office_is_admin check (not office or admin);

-- Members & access lists say which row is the office (so the office's Members page can leave it out).
create or replace function public.admin_list_members() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can manage access.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'gui', gui, 'hcp', hcp_index, 'email', email,
      'admin', admin, 'office', office, 'signedIn', user_id is not null) order by name)
    from public.members), '[]'::jsonb);
end $$;

-- Set the office login's email (creates the office the first time). A new email deletes the old login so the
-- office signs up again with the new one; blank removes the login altogether. Admins only. → the office's id
create function public.admin_set_office_login(p_email text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := nullif(lower(trim(p_email)), '');
  v_old public.members;
  v_id bigint;
begin
  if not public.is_admin() then
    raise exception 'Only admins can manage access.' using errcode = '42501';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That doesn''t look like an email address.' using errcode = 'P0001';
  end if;
  select * into v_old from public.members where office for update;
  if v_email is not null and exists (select 1 from public.members where email = v_email and id is distinct from v_old.id) then
    raise exception 'A member already uses that email. The office needs its own.' using errcode = 'P0001';
  end if;
  if v_old.id = public.current_member_id() and v_email is distinct from v_old.email then
    raise exception 'Change the office login from a member’s admin account.' using errcode = 'P0001';
  end if;

  if v_old.id is null then
    insert into public.members (name, email, admin, office) values ('Club office', v_email, true, true) returning id into v_id;
  else
    v_id := v_old.id;
    update public.members set email = v_email, user_id = case when v_email is distinct from v_old.email then null else user_id end
     where id = v_id;
    if v_old.user_id is not null and v_email is distinct from v_old.email then
      delete from auth.users where id = v_old.user_id;
    end if;
  end if;

  if v_email is not null then
    delete from public.access_requests where email = v_email;
    update public.members m set user_id = u.id from auth.users u
     where m.id = v_id and m.user_id is null and lower(u.email) = v_email;
  end if;
  return v_id;
end $$;

revoke execute on function public.admin_set_office_login(text) from public, anon;
grant execute on function public.admin_set_office_login(text) to authenticated;
