-- Whoever made a booking can take people off it, one at a time (themselves too, and the booking stays theirs to
-- manage). A guest taken off gives the guest points back. As with withdrawing: their "booked you in" notice goes,
-- unscored cards with them on go, and player events with them are called off. Taking the last person off deletes
-- the booking, as Delete booking does. The bookings list gives each person's place on the booking ('bp').

create function public.remove_from_booking(p_booking bigint, p_player bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_me bigint := public.current_member_id(); b public.bookings; bp public.booking_players; v_points int; v_cards int;
  v_gone jsonb; v_note text; v_events int;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found then
    raise exception 'That booking no longer exists.' using errcode = 'P0001';
  end if;
  if b.booked_by is distinct from v_me then
    raise exception 'Only the member who made the booking can take people off it.' using errcode = '42501';
  end if;
  select * into bp from public.booking_players where id = p_player and booking_id = b.id;
  if not found then
    raise exception 'That player is no longer on this booking.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.booking_players where booking_id = b.id and id <> bp.id) then
    return public.cancel_booking(b.id); -- the last one: the whole booking goes
  end if;
  v_gone := jsonb_build_array(case when bp.member_id is null then jsonb_build_object('g', bp.id) else jsonb_build_object('m', bp.member_id) end);
  v_note := (select name from public.members where id = v_me) || ' took ' || coalesce((select name from public.members where id = bp.member_id), bp.guest_name)
            || ' off the ' || public.hhmm(b.slot_id) || ' booking';
  with g as (delete from public.guest_visits where booking_player_id = bp.id returning points)
  select coalesce(sum(points), 0) into v_points from g;
  delete from public.booking_notices where booking_id = b.id and member_id = bp.member_id and kind = 'added';
  delete from public.booking_players where id = bp.id;
  with c as (delete from public.rounds r where r.slot_id = b.slot_id and r.lineup @> v_gone
               and not exists (select 1 from jsonb_array_elements(r.done) d where d = 'true') -- scored cards stay
               returning 1)
  select count(*) into v_cards from c;
  with ev as (update public.player_events e set status = 'cancelled', cancel_note = v_note, cancelled_at = now(), cancelled_by = v_me
               where e.status in ('pending', 'accepted') and e.date >= current_date
                 and exists (select 1 from jsonb_array_elements(e.players) p where (p->>'id')::bigint = bp.id) returning 1)
  select count(*) into v_events from ev;
  return jsonb_build_object('result', 'removed', 'pointsBack', v_points, 'cardsRemoved', v_cards, 'eventsCancelled', v_events);
end $function$;
revoke execute on function public.remove_from_booking(bigint, bigint) from public, anon;
grant execute on function public.remove_from_booking(bigint, bigint) to authenticated;

create or replace function public.get_my_bookings()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'date', s.date, 'time', s.start_time,
           'mine', b.booked_by = public.current_member_id(),
           'bookedBy', (select name from public.members where id = b.booked_by),
           -- holes already scored on this tee time's card(s) with this booking's players (deleting asks first)
           'scoredHoles', coalesce((select max((select count(*) from jsonb_array_elements(r.done) d where d = 'true'))
                                      from public.rounds r where r.slot_id = b.slot_id and r.date = s.date
                                       and exists (select 1 from public.booking_players bp where bp.booking_id = b.id and bp.member_id is not null
                                                     and r.lineup @> jsonb_build_array(jsonb_build_object('m', bp.member_id)))), 0),
           'guests', (select count(*) from public.booking_players bp where bp.booking_id = b.id and bp.member_id is null),
           'players', (select jsonb_agg(coalesce(m.name, bp.guest_name || ' (guest)') order by bp.id)
                         from public.booking_players bp left join public.members m on m.id = bp.member_id
                        where bp.booking_id = b.id),
           -- everyone on that tee time, this booking's players first
           'people', (select jsonb_agg(jsonb_build_object('bp', bp.id, 'memberId', bp.member_id, 'name', coalesce(m.name, bp.guest_name),
                                       'guest', bp.member_id is null, 'club', bp.guest_club,
                                       'hcp', coalesce(m.hcp_index, bp.guest_hcp), 'inBooking', bp.booking_id = b.id)
                                     order by bp.booking_id <> b.id, bp.id)
                        from public.booking_players bp left join public.members m on m.id = bp.member_id
                       where bp.slot_id = b.slot_id))
         order by s.date, s.start_time), '[]'::jsonb)
    from public.bookings b join public.tee_slots s on s.id = b.slot_id
   where s.date >= current_date
     and (b.booked_by = public.current_member_id()
          or exists (select 1 from public.booking_players bp where bp.booking_id = b.id and bp.member_id = public.current_member_id()))
$function$;
