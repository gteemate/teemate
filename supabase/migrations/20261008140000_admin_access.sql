-- Admins grant and remove access. Only an email an admin has added can sign in:
-- the before-user-created hook refuses to create a login (and so to send a link) for anyone else.

alter table public.members add column admin boolean not null default false;
grant select (admin) on public.members to authenticated;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select admin from public.members where user_id = auth.uid()), false)
$$;

-- Everyone with their email and whether they've signed in yet. Admins only.
create function public.admin_list_members() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can manage access.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'gui', gui, 'hcp', hcp_index, 'email', email,
      'committee', committee, 'admin', admin, 'signedIn', user_id is not null) order by name)
    from public.members), '[]'::jsonb);
end $$;

-- Add (p_id null) or update a member. Setting an email grants access; clearing it removes access.
create function public.admin_save_member(
  p_id bigint, p_name text, p_email text, p_gui text default null, p_hcp numeric default 54,
  p_committee boolean default false, p_admin boolean default false
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_me bigint := public.current_member_id();
  v_email text := nullif(lower(trim(p_email)), '');
  v_old public.members;
  v_id bigint := p_id;
begin
  if not public.is_admin() then
    raise exception 'Only admins can manage access.' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Enter a name.' using errcode = 'P0001';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That doesn''t look like an email address.' using errcode = 'P0001';
  end if;
  if nullif(trim(p_gui), '') is not null and trim(p_gui) !~ '^\d{6,10}$' then
    raise exception 'GUI numbers are 6–10 digits.' using errcode = 'P0001';
  end if;
  if p_hcp is null or p_hcp < -10 or p_hcp > 54 then
    raise exception 'Handicap index must be between +10 and 54.' using errcode = 'P0001';
  end if;
  if v_email is not null and exists (select 1 from public.members where email = v_email and id is distinct from p_id) then
    raise exception 'Another member already has that email.' using errcode = 'P0001';
  end if;
  if p_id = v_me and (not p_admin or v_email is null) then
    raise exception 'You can''t remove your own admin rights or access. Ask another admin.' using errcode = 'P0001';
  end if;

  if p_id is null then
    insert into public.members (name, email, gui, hcp_index, committee, admin)
      values (trim(p_name), v_email, nullif(trim(p_gui), ''), p_hcp, p_committee, p_admin)
      returning id into v_id;
  else
    select * into v_old from public.members where id = p_id for update;
    if not found then
      raise exception 'That member no longer exists.' using errcode = 'P0001';
    end if;
    update public.members
       set name = trim(p_name), email = v_email, gui = nullif(trim(p_gui), ''), hcp_index = p_hcp,
           committee = p_committee, admin = p_admin,
           user_id = case when v_email is distinct from v_old.email then null else user_id end
     where id = p_id;
    -- Email changed or removed: the old login no longer gets in.
    if v_old.user_id is not null and v_email is distinct from v_old.email then
      delete from auth.users where id = v_old.user_id;
    end if;
  end if;

  -- If they already have a login under this email, link it now.
  update public.members m set user_id = u.id from auth.users u
   where m.id = v_id and m.user_id is null and v_email is not null and lower(u.email) = v_email;
  return v_id;
end $$;

-- Before Supabase creates a login (which is what sends a first sign-in link), check the email
-- has been granted access. Called by Supabase Auth, not by the app.
create function public.hook_before_user_created(event jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.members where email = lower(event->'user'->>'email')) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'That email hasn''t been given access to TeeMates. Ask the club admin to add you.'));
end $$;

revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
grant select (email) on public.members to supabase_auth_admin;

revoke execute on function public.is_admin(), public.admin_list_members(),
  public.admin_save_member(bigint, text, text, text, numeric, boolean, boolean) from public, anon;
grant execute on function public.is_admin(), public.admin_list_members(),
  public.admin_save_member(bigint, text, text, text, numeric, boolean, boolean) to authenticated;
