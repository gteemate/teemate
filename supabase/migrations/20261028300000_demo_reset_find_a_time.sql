-- For a demo: the club office wipes Find a time for a knockout's matches (the days suggested, everyone's ticks and
-- notes, and the notices about them), so it can be shown again from the start. Bookings stay.
create function public.demo_reset_find_a_time(p_comp bigint) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_n int;
begin
  if not public.is_admin() then raise exception 'Only the club office can reset Find a time.' using errcode = '42501'; end if;
  if not exists (select 1 from public.signup_comps where id = p_comp) then raise exception 'That competition no longer exists.' using errcode = 'P0001'; end if;
  delete from public.booking_notices where kind in ('times', 'agreed') and ko_match_id in (select id from public.ko_matches where comp_id = p_comp);
  delete from public.match_time_notes where ko_match_id in (select id from public.ko_matches where comp_id = p_comp);
  delete from public.match_times where ko_match_id in (select id from public.ko_matches where comp_id = p_comp); -- the ticks go with them
  get diagnostics v_n = row_count;
  return jsonb_build_object('removed', v_n);
end $$;
revoke execute on function public.demo_reset_find_a_time(bigint) from public, anon;
grant execute on function public.demo_reset_find_a_time(bigint) to authenticated;
