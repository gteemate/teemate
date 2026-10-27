-- Tee times that have already gone today can't be booked (or added to) by members; the club office still can, e.g.
-- for a group that has just teed off. Times are the club's (London) clock.

create function public.club_minutes_now() returns int
language sql stable set search_path to '' as $$
  select (extract(hour from now() at time zone 'Europe/London') * 60 + extract(minute from now() at time zone 'Europe/London'))::int $$;

create or replace function public.book_as(p_booker bigint, p_slot_id bigint, p_member_ids bigint[], p_guests jsonb, p_check_release boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me bigint := p_booker;
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
  -- Not released yet (admins can book ahead for competitions and societies).
  -- Gone already today (club time); the office can still book one, e.g. a group that's just teed off.
  if p_check_release and v_slot.date = public.club_today() and v_slot.start_time < public.club_minutes_now() then
    raise exception 'That tee time has passed.' using errcode = 'P0001';
  end if;
  if p_check_release and public.tee_time_opens_at(v_slot.date) > now() then
    raise exception '%', public.not_open_message(v_slot.date) using errcode = 'P0001';
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
  -- Lock everyone being booked (in id order, so two bookings can't deadlock) before the 2-hour check:
  -- a second booking for the same person waits until this one has saved, then sees it.
  perform 1 from public.members where id = any(v_ids) order by id for update;
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
revoke execute on function public.book_as(bigint, bigint, bigint[], jsonb, boolean) from public, anon, authenticated;

create or replace function public.add_to_booking(p_booking bigint, p_member_ids bigint[], p_guests jsonb)
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
  if v_slot.date < public.club_today() or (v_slot.date = public.club_today() and v_slot.start_time < public.club_minutes_now() and not public.is_admin()) then
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
