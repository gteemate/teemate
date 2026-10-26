-- The leaderboard of the day (everyone's scores today): on for the days of the week the club chooses (0 Sunday … 6
-- Saturday; every day to start), with a switch for just today that goes back to the weekly setting tomorrow.
-- When it's off nobody sees today's scores (the app follows it); today's competitions show as usual.

alter table public.club_settings add column day_board_days int[] not null default '{0,1,2,3,4,5,6}'
  check (day_board_days <@ '{0,1,2,3,4,5,6}'::int[]);
alter table public.club_settings add column day_board_today jsonb; -- { date, on } for one day, or null

create or replace function public.get_theme()
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('main', colour_main, 'accent', colour_accent, 'name', club_name,
                            'courseLat', course_lat, 'courseLon', course_lon, 'coursePlace', course_place, 'feePayment', fee_payment,
                            'dayBoardDays', to_jsonb(day_board_days), 'dayBoardToday', day_board_today)
    from public.club_settings where id = 1
$$;

create function public.admin_set_day_board_days(p_days int[]) returns void
language plpgsql security definer set search_path to '' as $$
begin
  if not public.is_admin() then raise exception 'Only admins can change the club settings.' using errcode = '42501'; end if;
  if p_days is null or not (p_days <@ '{0,1,2,3,4,5,6}'::int[]) then raise exception 'The days are Sunday (0) to Saturday (6).' using errcode = 'P0001'; end if;
  update public.club_settings set day_board_days = (select coalesce(array_agg(distinct d order by d), '{}') from unnest(p_days) d) where id = 1;
end $$;

-- Today only: on, off, or null to go back to the weekly setting.
create function public.admin_set_day_board_today(p_on boolean) returns void
language plpgsql security definer set search_path to '' as $$
begin
  if not public.is_admin() then raise exception 'Only admins can change the club settings.' using errcode = '42501'; end if;
  update public.club_settings set day_board_today = case when p_on is null then null else jsonb_build_object('date', current_date, 'on', p_on) end where id = 1;
end $$;

revoke execute on function public.admin_set_day_board_days(int[]), public.admin_set_day_board_today(boolean) from public, anon;
grant execute on function public.admin_set_day_board_days(int[]), public.admin_set_day_board_today(boolean) to authenticated;
