-- Add to a booking: anyone on a booking (or who made it) can add members or guests to it while the tee time has
-- room, e.g. a fourth player. The same checks as booking (already on the time, the 2-hour gap, guest details and
-- points); a guest is charged to whoever adds them. New members get a "booked you in" notice naming who added them.
-- The bookings list now says how many places the time has ('capacity').

create function public.add_to_booking(p_booking bigint, p_member_ids bigint[], p_guests jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_me bigint := public.current_member_id(); b public.bookings; v_slot public.tee_slots;
  v_ids bigint[] := coalesce(p_member_ids, '{}'); v_guests int := jsonb_array_length(coalesce(p_guests, '[]'));
  v_taken int; v_cost int := 0; v_used int; g jsonb; v_bp bigint; v_close text; v_new bigint[];
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found then
    raise exception 'That booking no longer exists.' using errcode = 'P0001';
  end if;
  if b.booked_by is distinct from v_me and not exists (select 1 from public.booking_players where booking_id = b.id and member_id = v_me) then
    raise exception 'That isn''t your booking.' using errcode = '42501';
  end if;
  select * into v_slot from public.tee_slots where id = b.slot_id for update;
  if v_slot.date < current_date then
    raise exception 'That tee time has passed.' using errcode = 'P0001';
  end if;
  if cardinality(v_ids) + v_guests = 0 then
    raise exception 'Add a player or guest first.' using errcode = 'P0001';
  end if;
  if (select count(distinct x) from unnest(v_ids) x) <> cardinality(v_ids) then
    raise exception 'A player is listed twice.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.members where id = any(v_ids)) <> cardinality(v_ids) then
    raise exception 'One of those players isn''t a member.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.booking_players where slot_id = v_slot.id and member_id = any(v_ids)) then
    raise exception 'One of your group is already booked on this time.' using errcode = 'P0001';
  end if;
  if cardinality(v_ids) > 0 then
    perform 1 from public.members where id = any(v_ids) order by id for update;
    v_close := public.too_close(v_slot.id, v_ids);
    if v_close is not null then
      raise exception '%', v_close using errcode = 'P0001';
    end if;
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
    raise exception 'Sorry, there’s no space left on this time.' using errcode = 'P0001';
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
  insert into public.booking_players (booking_id, slot_id, member_id)
    select b.id, v_slot.id, x from unnest(v_ids) with ordinality u(x, o) order by o;
  for g in select * from jsonb_array_elements(coalesce(p_guests, '[]')) loop
    insert into public.booking_players (booking_id, slot_id, guest_name, guest_club, guest_gui, guest_hcp)
      values (b.id, v_slot.id, trim(g->>'name'), nullif(trim(g->>'club'), ''), nullif(g->>'gui', ''), (g->>'hcp')::numeric)
      returning id into v_bp;
    insert into public.guest_visits (member_id, booking_player_id, date, guest_name, guest_club, course_id, points)
      values (v_me, v_bp, v_slot.date, trim(g->>'name'), nullif(trim(g->>'club'), ''), v_slot.course_id, v_cost);
  end loop;
  -- "booked you in" for the members just added, from whoever added them
  insert into public.booking_notices (member_id, kind, date, old_time, booking_id, by_name, with_names)
  select bp.member_id, 'added', v_slot.date, v_slot.start_time, b.id, (select name from public.members where id = v_me),
         array(select split_part(coalesce(m2.name, o.guest_name), ' ', 1) from public.booking_players o
                 left join public.members m2 on m2.id = o.member_id
                where o.booking_id = b.id and o.id <> bp.id order by o.id)
    from public.booking_players bp where bp.booking_id = b.id and bp.member_id = any(v_ids) and bp.member_id <> v_me;
  return jsonb_build_object('added', cardinality(v_ids) + v_guests, 'pointsUsed', v_cost * v_guests);
end $function$;
revoke execute on function public.add_to_booking(bigint, bigint[], jsonb) from public, anon;
grant execute on function public.add_to_booking(bigint, bigint[], jsonb) to authenticated;

create or replace function public.get_my_bookings()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'date', s.date, 'time', s.start_time, 'capacity', s.capacity,
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
