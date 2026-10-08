-- Club colours: two hex codes an admin sets; the whole app (and the sign-in screen) is themed from them.

alter table public.club_settings
  add column colour_main text not null default '#19335A' check (colour_main ~ '^#[0-9A-Fa-f]{6}$'),
  add column colour_accent text not null default '#762A43' check (colour_accent ~ '^#[0-9A-Fa-f]{6}$');

-- Readable by anyone, including the sign-in screen before someone has signed in.
create function public.get_theme() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('main', colour_main, 'accent', colour_accent) from public.club_settings where id = 1
$$;

create function public.admin_set_theme(p_main text, p_accent text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change the club colours.' using errcode = '42501';
  end if;
  if p_main !~ '^#[0-9A-Fa-f]{6}$' or p_accent !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Colours must be 6-digit hex codes like #19335A.' using errcode = 'P0001';
  end if;
  update public.club_settings set colour_main = upper(p_main), colour_accent = upper(p_accent) where id = 1;
end $$;

revoke execute on function public.get_theme(), public.admin_set_theme(text, text) from public;
grant execute on function public.get_theme() to anon, authenticated;
grant execute on function public.admin_set_theme(text, text) to authenticated;
