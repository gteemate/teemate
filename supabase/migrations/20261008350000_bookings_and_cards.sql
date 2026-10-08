-- Bookings and cards stay in step, and a member can't hold two tee times within 2 hours of each other.
--  * Deleting a booking removes any card started from that tee time with someone from the booking on it,
--    if nothing has been scored on it yet (whoever started it). Withdrawing does the same for cards
--    with me on them. A card with saved holes is kept.
--  * My bookings list each player (for the booking details sheet).

create or replace function public.cancel_booking(p_booking bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me bigint := public.current_member_id(); b public.bookings; v_points int; v_cards int; v_gone jsonb;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found then
    raise exception 'That booking no longer exists.' using errcode = 'P0001';
  end if;
  if b.booked_by = v_me then
    select jsonb_agg(case when member_id is null then jsonb_build_object('g', id) else jsonb_build_object('m', member_id) end)
      into v_gone from public.booking_players where booking_id = b.id;
    with g as (delete from public.guest_visits where booking_player_id in (select id from public.booking_players where booking_id = b.id) returning points)
    select coalesce(sum(points), 0) into v_points from g;
    delete from public.bookings where id = b.id;
  elsif exists (select 1 from public.booking_players where booking_id = b.id and member_id = v_me) then
    v_gone := jsonb_build_array(jsonb_build_object('m', v_me));
    v_points := 0;
    delete from public.booking_players where booking_id = b.id and member_id = v_me;
  else
    raise exception 'That isn''t your booking.' using errcode = '42501';
  end if;
  with c as (delete from public.rounds r where r.slot_id = b.slot_id
               and exists (select 1 from jsonb_array_elements(coalesce(v_gone, '[]')) x where r.lineup @> jsonb_build_array(x))
               and not exists (select 1 from jsonb_array_elements(r.done) d where d = 'true') returning 1)
  select count(*) into v_cards from c;
  return jsonb_build_object('result', case when b.booked_by = v_me then 'deleted' else 'withdrawn' end, 'pointsBack', v_points, 'cardsRemoved', v_cards);
end $$;

create or replace function public.get_my_bookings() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'date', s.date, 'time', s.start_time,
           'mine', b.booked_by = public.current_member_id(),
           'bookedBy', (select name from public.members where id = b.booked_by),
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
$$;

-- The 2-hour rule, checked inside book_tee_time for everyone being booked.
create or replace function public.too_close(p_slot bigint, p_members bigint[]) returns text
language sql stable security definer set search_path = '' as $$
  select case when m.id = public.current_member_id() then 'You''re' else m.name || ' is' end
         || ' already booked at ' || to_char(make_time(s.start_time / 60, s.start_time % 60, 0), 'HH24:MI')
         || '. Tee times have to be at least 2 hours apart.'
    from public.tee_slots me
    join public.tee_slots s on s.date = me.date and s.id <> me.id and abs(s.start_time - me.start_time) < 120
    join public.booking_players bp on bp.slot_id = s.id
    join public.members m on m.id = bp.member_id
   where me.id = p_slot and bp.member_id = any(p_members)
   order by m.id <> public.current_member_id(), s.start_time
   limit 1
$$;
revoke execute on function public.too_close(bigint, bigint[]) from public, anon;

create or replace function public.book_tee_time(p_slot_id bigint, p_member_ids bigint[] default '{}', p_guests jsonb default '[]')
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me bigint := public.current_member_id();
  v_slot public.tee_slots;
  v_ids bigint[];
  v_guests int := jsonb_array_length(coalesce(p_guests, '[]'));
  v_taken int;
  v_cost int := 0;
  v_used int;
  v_booking bigint;
  g jsonb;
  v_bp bigint;
  v_close text;
begin
  if v_me is null then
    raise exception 'Only members can book tee times.' using errcode = '42501';
  end if;

  select * into v_slot from public.tee_slots where id = p_slot_id for update;
  if not found then
    raise exception 'That tee time no longer exists.' using errcode = 'P0001';
  end if;
  if v_slot.date < current_date then
    raise exception 'That tee time has passed.' using errcode = 'P0001';
  end if;

  v_ids := array[v_me] || coalesce(p_member_ids, '{}');
  if (select count(distinct x) from unnest(v_ids) x) <> cardinality(v_ids) then
    raise exception 'A player is listed twice.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.members where id = any(v_ids)) <> cardinality(v_ids) then
    raise exception 'One of those players isn''t a member.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.booking_players where slot_id = v_slot.id and member_id = any(v_ids)) then
    raise exception 'One of your group is already booked on this time.' using errcode = 'P0001';
  end if;
  v_close := public.too_close(v_slot.id, v_ids);
  if v_close is not null then
    raise exception '%', v_close using errcode = 'P0001';
  end if;

  for g in select * from jsonb_array_elements(coalesce(p_guests, '[]')) loop
    if coalesce(trim(g->>'name'), '') = '' then
      raise exception 'Every guest needs a name.' using errcode = 'P0001';
    end if;
    if coalesce(g->>'gui', '') <> '' and (g->>'gui') !~ '^\d{6,10}$' then
      raise exception 'GUI numbers are 6–10 digits.' using errcode = 'P0001';
    end if;
    if g ? 'hcp' and g->>'hcp' is not null and ((g->>'hcp')::numeric < -10 or (g->>'hcp')::numeric > 54) then
      raise exception 'Handicap index must be between +10 and 54.' using errcode = 'P0001';
    end if;
  end loop;

  select count(*) into v_taken from public.booking_players where slot_id = v_slot.id;
  if cardinality(v_ids) + v_guests > v_slot.capacity - v_taken then
    raise exception 'Sorry, those spaces have just been taken. Pick another time.' using errcode = 'P0001';
  end if;

  if v_guests > 0 then
    perform 1 from public.members where id = v_me for update;
    v_cost := (select guest_points from public.courses where id = v_slot.course_id);
    select coalesce(sum(points), 0) into v_used from public.guest_visits
     where member_id = v_me and date_trunc('year', date) = date_trunc('year', v_slot.date::timestamp);
    if v_used + v_cost * v_guests > (select guest_allowance from public.club_settings where id = 1) then
      raise exception 'You don''t have enough guest points for this booking.' using errcode = 'P0001';
    end if;
  end if;

  insert into public.bookings (slot_id, booked_by) values (v_slot.id, v_me) returning id into v_booking;
  insert into public.booking_players (booking_id, slot_id, member_id)
    select v_booking, v_slot.id, x from unnest(v_ids) with ordinality u(x, o) order by o;
  for g in select * from jsonb_array_elements(coalesce(p_guests, '[]')) loop
    insert into public.booking_players (booking_id, slot_id, guest_name, guest_club, guest_gui, guest_hcp)
      values (v_booking, v_slot.id, trim(g->>'name'), nullif(trim(g->>'club'), ''), nullif(g->>'gui', ''), (g->>'hcp')::numeric)
      returning id into v_bp;
    insert into public.guest_visits (member_id, booking_player_id, date, guest_name, guest_club, course_id, points)
      values (v_me, v_bp, v_slot.date, trim(g->>'name'), nullif(trim(g->>'club'), ''), v_slot.course_id, v_cost);
  end loop;

  return jsonb_build_object(
    'id', v_booking, 'date', v_slot.date, 'time', v_slot.start_time,
    'guests', v_guests, 'pointsUsed', v_cost * v_guests,
    'players', (select jsonb_agg(coalesce(m.name, bp.guest_name || ' (guest)') order by bp.id)
                  from public.booking_players bp left join public.members m on m.id = bp.member_id
                 where bp.booking_id = v_booking));
end $$;
