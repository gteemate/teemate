-- Deleting a booking that has scores: the app asks first, then deletes the scorecard too (p_remove_scores);
-- without confirming, scored cards stay as before. The bookings list says how many holes are scored, so the app
-- knows to ask. And anyone on a card can delete it, not only whoever started it (a card can't get stuck).

drop function public.cancel_booking(bigint);
create function public.cancel_booking(p_booking bigint, p_remove_scores boolean default false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_me bigint := public.current_member_id(); b public.bookings; v_points int; v_cards int; v_gone jsonb;
  v_bps bigint[]; v_note text; v_events int;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found then
    raise exception 'That booking no longer exists.' using errcode = 'P0001';
  end if;
  if b.booked_by = v_me then
    select array_agg(id) into v_bps from public.booking_players where booking_id = b.id;
    v_note := (select name from public.members where id = v_me) || ' cancelled the ' || public.hhmm(b.slot_id) || ' booking';
    select jsonb_agg(case when member_id is null then jsonb_build_object('g', id) else jsonb_build_object('m', member_id) end)
      into v_gone from public.booking_players where booking_id = b.id;
    with g as (delete from public.guest_visits where booking_player_id in (select id from public.booking_players where booking_id = b.id) returning points)
    select coalesce(sum(points), 0) into v_points from g;
    delete from public.bookings where id = b.id;
  elsif exists (select 1 from public.booking_players where booking_id = b.id and member_id = v_me) then
    v_gone := jsonb_build_array(jsonb_build_object('m', v_me));
    select array_agg(id) into v_bps from public.booking_players where booking_id = b.id and member_id = v_me;
    v_note := (select name from public.members where id = v_me) || ' withdrew from the ' || public.hhmm(b.slot_id);
    v_points := 0;
    delete from public.booking_players where booking_id = b.id and member_id = v_me;
  else
    raise exception 'That isn''t your booking.' using errcode = '42501';
  end if;
  with c as (delete from public.rounds r where r.slot_id = b.slot_id
               and exists (select 1 from jsonb_array_elements(coalesce(v_gone, '[]')) x where r.lineup @> jsonb_build_array(x))
               and (not exists (select 1 from jsonb_array_elements(r.done) d where d = 'true')
                    or (p_remove_scores and b.booked_by = v_me)) -- scored cards only when the booker confirmed
               returning 1)
  select count(*) into v_cards from c;
  -- player events with anyone who's just come off the tee time are off; everyone else in them is told why
  with ev as (update public.player_events e set status = 'cancelled', cancel_note = v_note, cancelled_at = now(), cancelled_by = v_me
               where e.status in ('pending', 'accepted') and e.date >= current_date
                 and exists (select 1 from jsonb_array_elements(e.players) p where (p->>'id')::bigint = any(v_bps)) returning 1)
  select count(*) into v_events from ev;
  return jsonb_build_object('result', case when b.booked_by = v_me then 'deleted' else 'withdrawn' end, 'pointsBack', v_points, 'cardsRemoved', v_cards, 'eventsCancelled', v_events);
end $function$;
revoke execute on function public.cancel_booking(bigint, boolean) from public, anon;
grant execute on function public.cancel_booking(bigint, boolean) to authenticated;

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
           'people', (select jsonb_agg(jsonb_build_object('memberId', bp.member_id, 'name', coalesce(m.name, bp.guest_name),
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

drop policy "own rounds delete" on public.rounds;
create policy "card players delete" on public.rounds for delete to authenticated
  using (created_by = public.current_member_id() or public.on_card(lineup));
