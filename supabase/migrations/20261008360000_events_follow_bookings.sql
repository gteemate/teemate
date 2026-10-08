-- Player events follow bookings: if anyone in an event comes off their tee time (the booking is deleted,
-- or they withdraw), the event is off, and the others in it see why on their Scores tab.
-- cancel_note says who and what ("Gareth Cochrane cancelled the 07:50 booking", "Cancelled by Peter Reid").

alter table public.player_events add column cancel_note text, add column cancelled_at timestamptz;
alter table public.player_events add column cancelled_by bigint references public.members on delete set null;

-- "07:50" for a tee time
create function public.hhmm(p_slot bigint) returns text
language sql stable security definer set search_path = '' as $$
  select to_char(make_time(start_time / 60, start_time % 60, 0), 'HH24:MI') from public.tee_slots where id = p_slot
$$;
revoke execute on function public.hhmm(bigint) from public, anon;

create or replace function public.cancel_player_event(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.player_events where id = p_id and (created_by = public.current_member_id() or public.is_admin())) then
    raise exception 'Only the person who proposed it can cancel it.' using errcode = '42501';
  end if;
  update public.player_events
     set status = 'cancelled', cancelled_at = now(), cancelled_by = public.current_member_id(),
         cancel_note = 'Cancelled by ' || coalesce((select name from public.members where id = public.current_member_id()), 'an admin')
   where id = p_id and status in ('pending', 'accepted');
end $$;

create or replace function public.cancel_booking(p_booking bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
               and not exists (select 1 from jsonb_array_elements(r.done) d where d = 'true') returning 1)
  select count(*) into v_cards from c;
  -- player events with anyone who's just come off the tee time are off; everyone else in them is told why
  with ev as (update public.player_events e set status = 'cancelled', cancel_note = v_note, cancelled_at = now(), cancelled_by = v_me
               where e.status in ('pending', 'accepted') and e.date >= current_date
                 and exists (select 1 from jsonb_array_elements(e.players) p where (p->>'id')::bigint = any(v_bps)) returning 1)
  select count(*) into v_events from ev;
  return jsonb_build_object('result', case when b.booked_by = v_me then 'deleted' else 'withdrawn' end, 'pointsBack', v_points, 'cardsRemoved', v_cards, 'eventsCancelled', v_events);
end $$;
