-- Club singles matches hold the four-ball: booking a 1 v 1 match from a club knockout or a club event holds the other
-- places on the tee time ("Autumn Knockout match"), so nobody else can book them. The hold lives on the booking
-- (held, held_for), counts wherever a time's space is checked, moves with the booking, and goes when it's no longer a
-- match of two (a player withdraws or is taken off).

alter table public.bookings add column held int not null default 0 check (held between 0 and 3),
                            add column held_for text;

-- A time's taken places: its players, and places held for a match.
create function public.slot_taken(p_slot bigint) returns int
language sql stable set search_path to '' as $$
  select ((select count(*) from public.booking_players where slot_id = p_slot)
        + (select coalesce(sum(held), 0) from public.bookings where slot_id = p_slot))::int $$;
revoke execute on function public.slot_taken(bigint) from public, anon, authenticated;

-- A moved booking keeps its hold, if the new time has room for it.
create function public.carry_hold(p_old public.bookings, p_new bigint) returns void
language plpgsql set search_path to '' as $$
declare v_slot bigint;
begin
  if p_old.held = 0 then return; end if;
  update public.bookings set held = p_old.held, held_for = p_old.held_for where id = p_new returning slot_id into v_slot;
  if public.slot_taken(v_slot) > (select capacity from public.tee_slots where id = v_slot) then
    raise exception 'There isn’t room for the whole match on that time. Pick an empty time.' using errcode = 'P0001';
  end if;
end $$;
revoke execute on function public.carry_hold(public.bookings, bigint) from public, anon, authenticated;

-- Not a match of two any more: the held places open up.
create function public.release_hold() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  update public.bookings b set held = 0, held_for = null
   where b.id = old.booking_id and b.held > 0
     and (select count(*) from public.booking_players bp where bp.booking_id = b.id and bp.member_id is not null) < 2;
  return null;
end $$;
create trigger release_hold after delete on public.booking_players for each row execute function public.release_hold();

create function public.book_club_match(p_slot bigint, p_opponent bigint, p_kind text, p_ref bigint) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_me bigint := public.current_member_id(); c public.signup_comps; ev public.events; x jsonb; v_label text; r jsonb; v_cap int; v_id bigint;
begin
  if p_kind = 'ko' then
    select * into c from public.signup_comps where id = p_ref;
    if not found or not exists (
         select 1 from public.ko_matches m join public.signup_entries ea on ea.id = m.a_entry join public.signup_entries eb on eb.id = m.b_entry
          where m.comp_id = c.id and m.status in ('open', 'reported', 'disputed')
            and ((ea.member_id = v_me and eb.member_id = p_opponent) or (ea.member_id = p_opponent and eb.member_id = v_me))) then
      raise exception 'That isn''t your match.' using errcode = '42501';
    end if;
    if c.created_by is not null or c.kind <> 'singles' then
      raise exception 'Only club singles matches hold the other places.' using errcode = 'P0001';
    end if;
    v_label := c.name;
  elsif p_kind = 'event' then
    select * into ev from public.events where id = p_ref;
    if found then
      select m into x from jsonb_each(ev.matches) d, jsonb_array_elements(d.value) m
       where (m->'a' @> to_jsonb(v_me) and m->'b' @> to_jsonb(p_opponent)) or (m->'b' @> to_jsonb(v_me) and m->'a' @> to_jsonb(p_opponent))
       limit 1;
    end if;
    if x is null then
      raise exception 'That isn''t your match.' using errcode = '42501';
    end if;
    if not ev.club or jsonb_array_length(x->'a') <> 1 or jsonb_array_length(x->'b') <> 1 then
      raise exception 'Only club singles matches hold the other places.' using errcode = 'P0001';
    end if;
    v_label := ev.name;
  else
    raise exception 'That isn''t your match.' using errcode = '42501';
  end if;
  r := public.book_as(v_me, p_slot, array[p_opponent], '[]', not public.is_admin());
  v_id := (r->>'id')::bigint;
  select capacity into v_cap from public.tee_slots where id = p_slot;
  update public.bookings set held = greatest(v_cap - 2, 0), held_for = v_label || ' match' where id = v_id;
  if public.slot_taken(p_slot) > v_cap then
    raise exception 'There isn’t room for the whole match on that time. Pick an empty time.' using errcode = 'P0001';
  end if;
  perform public.notify_added(v_id);
  return r || jsonb_build_object('held', greatest(v_cap - 2, 0), 'heldFor', v_label || ' match');
end $$;
revoke execute on function public.book_club_match(bigint, bigint, text, bigint) from public, anon;
grant execute on function public.book_club_match(bigint, bigint, text, bigint) to authenticated;

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

  v_taken := public.slot_taken(v_slot.id); -- players, and places held for a club singles match
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
  if b.held > 0 then
    raise exception 'This time is held for the %.', b.held_for using errcode = 'P0001';
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
  v_taken := public.slot_taken(v_slot.id);
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

create or replace function public.move_match_booking(p_booking bigint, p_slot bigint) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_me bigint := public.current_member_id(); b public.bookings; v_old date; v_new date; v_ids bigint[]; v_bps bigint[]; v_lineups jsonb; r jsonb;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found then raise exception 'That booking no longer exists.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.booking_players where booking_id = b.id and member_id = v_me) then
    raise exception 'You can only move a booking you''re on.' using errcode = '42501';
  end if;
  if exists (select 1 from public.booking_players where booking_id = b.id and member_id is null) then
    raise exception 'A booking with guests can''t be moved. Cancel it and book again.' using errcode = 'P0001';
  end if;
  select date into v_old from public.tee_slots where id = b.slot_id;
  select date into v_new from public.tee_slots where id = p_slot;
  if v_new is null or v_new <> v_old or p_slot = b.slot_id then
    raise exception 'A match can only move to another time on the same day.' using errcode = 'P0001';
  end if;
  select array_agg(member_id), array_agg(id) into v_ids, v_bps from public.booking_players where booking_id = b.id;
  select jsonb_agg(jsonb_build_object('m', x)) into v_lineups from unnest(v_ids) x;
  if exists (select 1 from public.rounds r where r.slot_id = b.slot_id and exists (select 1 from jsonb_array_elements(v_lineups) x where r.lineup @> jsonb_build_array(x))
               and exists (select 1 from jsonb_array_elements(r.done) d where d = 'true')) then
    raise exception 'This match has already started, so it can''t move.' using errcode = 'P0001';
  end if;
  -- Off the old time: its unscored card, any on-the-day match it was part of, then the booking itself.
  delete from public.rounds r where r.slot_id = b.slot_id and exists (select 1 from jsonb_array_elements(v_lineups) x where r.lineup @> jsonb_build_array(x));
  update public.player_events e set status = 'cancelled', cancel_note = 'The ' || public.hhmm(b.slot_id) || ' tee time moved', cancelled_at = now(), cancelled_by = v_me
   where e.status in ('pending', 'accepted') and e.date >= current_date
     and exists (select 1 from jsonb_array_elements(e.players) p where (p->>'id')::bigint = any(v_bps));
  delete from public.bookings where id = b.id;
  -- On to the new time, booked by the same member as before (refusals undo all of the above).
  r := public.book_as(b.booked_by, p_slot, array(select x from unnest(v_ids) x where x <> b.booked_by), '[]', true);
  perform public.carry_hold(b, (r->>'id')::bigint);
  return r;
end $$;

create or replace function public.admin_move_booking(p_booking bigint, p_slot bigint, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.bookings; v_old public.tee_slots; v_new public.tee_slots; v_ids bigint[]; v_guests jsonb; r jsonb;
begin
  select array_agg(member_id order by id) filter (where member_id is not null),
         coalesce(jsonb_agg(jsonb_build_object('name', guest_name, 'club', guest_club, 'gui', guest_gui, 'hcp', guest_hcp) order by id) filter (where member_id is null), '[]')
    into v_ids, v_guests from public.booking_players where booking_id = p_booking;
  select s.* into v_old from public.tee_slots s join public.bookings bk on bk.slot_id = s.id where bk.id = p_booking;
  select * into v_new from public.tee_slots where id = p_slot;
  if v_new.id is null or v_new.id = v_old.id then raise exception 'Pick a different tee time.' using errcode = 'P0001'; end if;
  b := public.office_take_off(p_booking, 'The club office moved the ' || public.hhmm(v_old.id) || ' tee time');
  -- Same booker, players and guests at the new time (refusals there undo everything).
  r := public.book_as(b.booked_by, p_slot, array(select x from unnest(v_ids) x where x <> b.booked_by), v_guests, false);
  perform public.carry_hold(b, (r->>'id')::bigint);
  insert into public.booking_notices (member_id, kind, date, old_time, new_time, new_date, note)
    select x, 'moved', v_new.date, v_old.start_time, v_new.start_time, v_new.date, nullif(trim(left(p_note, 300)), '') from unnest(v_ids) x;
  return r;
end $$;

create or replace function public.get_tee_sheet(p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_course bigint := (select id from public.courses order by id limit 1);
begin
  if public.current_member_id() is null then
    raise exception 'Only members can see the tee sheet.' using errcode = '42501';
  end if;
  if p_date between current_date and current_date + 366 then
    insert into public.tee_slots (course_id, date, start_time, twilight)
    select v_course, p_date, m, m >= 15 * 60
      from generate_series(7 * 60 + 30, 16 * 60 + 30, 10) m
     where not (m >= 12 * 60 + 20 and m < 13 * 60)
    on conflict do nothing;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', s.id, 'date', s.date, 'time', s.start_time, 'capacity', s.capacity, 'twilight', s.twilight,
             'held', (select coalesce(sum(hb.held), 0) from public.bookings hb where hb.slot_id = s.id),
             'heldFor', (select max(hb.held_for) from public.bookings hb where hb.slot_id = s.id and hb.held > 0),
             'players', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'id', bp.id, 'name', coalesce(m.name, bp.guest_name), 'memberId', bp.member_id, 'bookingId', bp.booking_id,
                        'bookedBy', b.booked_by,
                        'guest', bp.member_id is null, 'hcp', case when bp.member_id is null then bp.guest_hcp else m.hcp_index end)
                      order by bp.id)
                 from public.booking_players bp left join public.members m on m.id = bp.member_id join public.bookings b on b.id = bp.booking_id
                where bp.slot_id = s.id), '[]'::jsonb))
           order by s.start_time)
      from public.tee_slots s
     where s.course_id = v_course and s.date = p_date), '[]'::jsonb);
end $function$;

create or replace function public.get_my_bookings()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'date', s.date, 'time', s.start_time, 'capacity', s.capacity, 'held', b.held, 'heldFor', b.held_for,
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
