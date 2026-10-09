-- Club name: shown on the membership card on Home. Admins set it; empty = not shown.

alter table public.club_settings
  add column club_name text not null default '' check (char_length(club_name) <= 60);

-- Readable by anyone, including the sign-in screen before someone has signed in.
create or replace function public.get_theme() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('main', colour_main, 'accent', colour_accent, 'name', club_name) from public.club_settings where id = 1
$$;

create function public.admin_set_club_name(p_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change the club name.' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_name, ''))) > 60 then
    raise exception 'Club name must be 60 characters or fewer.' using errcode = 'P0001';
  end if;
  update public.club_settings set club_name = trim(coalesce(p_name, '')) where id = 1;
end $$;

revoke execute on function public.admin_set_club_name(text) from public;
grant execute on function public.admin_set_club_name(text) to authenticated;
