-- Cancel a booking. The person who made it deletes the whole booking (everyone in it comes off
-- the tee time and their guest points are given back). Someone booked in by another member can
-- withdraw just themselves.

create or replace function public.get_my_bookings() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'date', s.date, 'time', s.start_time,
           'mine', b.booked_by = public.current_member_id(),
           'guests', (select count(*) from public.booking_players bp where bp.booking_id = b.id and bp.member_id is null),
           'players', (select jsonb_agg(coalesce(m.name, bp.guest_name || ' (guest)') order by bp.id)
                         from public.booking_players bp left join public.members m on m.id = bp.member_id
                        where bp.booking_id = b.id))
         order by s.date, s.start_time), '[]'::jsonb)
    from public.bookings b join public.tee_slots s on s.id = b.slot_id
   where s.date >= current_date
     and (b.booked_by = public.current_member_id()
          or exists (select 1 from public.booking_players bp where bp.booking_id = b.id and bp.member_id = public.current_member_id()))
$$;

-- Returns 'deleted' (with guest points refunded) or 'withdrawn'.
create function public.cancel_booking(p_booking bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me bigint := public.current_member_id(); b public.bookings; v_points int;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found then
    raise exception 'That booking no longer exists.' using errcode = 'P0001';
  end if;
  if b.booked_by = v_me then
    -- give back the guest points, then remove the booking and everyone in it
    with g as (delete from public.guest_visits where booking_player_id in (select id from public.booking_players where booking_id = b.id) returning points)
    select coalesce(sum(points), 0) into v_points from g;
    delete from public.bookings where id = b.id;
    return jsonb_build_object('result', 'deleted', 'pointsBack', v_points);
  end if;
  if exists (select 1 from public.booking_players where booking_id = b.id and member_id = v_me) then
    delete from public.booking_players where booking_id = b.id and member_id = v_me;
    return jsonb_build_object('result', 'withdrawn', 'pointsBack', 0);
  end if;
  raise exception 'That isn''t your booking.' using errcode = '42501';
end $$;
revoke execute on function public.cancel_booking(bigint) from public, anon;
grant execute on function public.cancel_booking(bigint) to authenticated;
