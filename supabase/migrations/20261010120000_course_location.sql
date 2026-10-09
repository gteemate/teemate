-- The course location, for the weather in Home's header (Open-Meteo). Set by admins in Club admin;
-- readable before sign-in with the club colours (get_theme).

alter table public.club_settings add column course_lat double precision, add column course_lon double precision, add column course_place text;

create or replace function public.admin_set_course_location(p_lat double precision, p_lon double precision, p_place text)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can set the course location.' using errcode = '42501';
  end if;
  if p_lat is not null and (p_lat not between -90 and 90 or p_lon is null or p_lon not between -180 and 180) then
    raise exception 'That location isn''t valid.' using errcode = 'P0001';
  end if;
  update public.club_settings
     set course_lat = p_lat, course_lon = case when p_lat is null then null else p_lon end,
         course_place = case when p_lat is null then null else left(trim(coalesce(p_place, '')), 80) end
   where id = 1;
end $$;
revoke execute on function public.admin_set_course_location(double precision, double precision, text) from public, anon;
grant execute on function public.admin_set_course_location(double precision, double precision, text) to authenticated;

create or replace function public.get_theme()
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('main', colour_main, 'accent', colour_accent, 'name', club_name,
                            'courseLat', course_lat, 'courseLon', course_lon, 'coursePlace', course_place)
    from public.club_settings where id = 1
$$;
