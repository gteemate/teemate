-- Guests can play: each guest on a tee time has an optional handicap index that anyone in that
-- four-ball can set or change at any time (e.g. on the first tee). Scorecards can include guests
-- and can be started from a tee time.

-- ---------------------------------------------------------------- guest handicaps

alter table public.booking_players add column guest_hcp numeric(4,1) check (guest_hcp between -10 and 54);

-- Set or clear a guest's handicap index. Anyone booked on that tee time, or an admin.
create function public.set_guest_handicap(p_guest_id bigint, p_hcp numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare v_slot bigint;
begin
  select slot_id into v_slot from public.booking_players where id = p_guest_id and member_id is null;
  if not found then
    raise exception 'That guest is no longer on the tee time.' using errcode = 'P0001';
  end if;
  if not (public.is_admin() or exists (select 1 from public.booking_players where slot_id = v_slot and member_id = public.current_member_id())) then
    raise exception 'Only players on that tee time can set their guest''s handicap.' using errcode = '42501';
  end if;
  if p_hcp is not null and (p_hcp < -10 or p_hcp > 54) then
    raise exception 'Handicap index must be between +10 and 54.' using errcode = 'P0001';
  end if;
  update public.booking_players set guest_hcp = p_hcp where id = p_guest_id;
end $$;

-- Guests by id (for scorecards and the leaderboard): [{ id, name, club, hcp }].
create function public.get_guests(p_ids bigint[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.current_member_id() is null then
    raise exception 'Only members can see this.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', guest_name, 'club', guest_club, 'hcp', guest_hcp))
    from public.booking_players where id = any(p_ids) and member_id is null), '[]'::jsonb);
end $$;

-- Tee sheet players now also carry their booking id and, for guests, their handicap.
create or replace function public.get_tee_sheet(p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_course bigint := (select id from public.courses order by id limit 1);
begin
  if public.current_member_id() is null then
    raise exception 'Only members can see the tee sheet.' using errcode = '42501';
  end if;
  if p_date between current_date and current_date + 13 then
    insert into public.tee_slots (course_id, date, start_time, twilight)
    select v_course, p_date, m, m >= 15 * 60
      from generate_series(7 * 60 + 30, 16 * 60 + 30, 10) m
     where not (m >= 12 * 60 + 20 and m < 13 * 60)
    on conflict do nothing;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', s.id, 'date', s.date, 'time', s.start_time, 'capacity', s.capacity, 'twilight', s.twilight,
             'players', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'id', bp.id, 'name', coalesce(m.name, bp.guest_name), 'memberId', bp.member_id,
                        'guest', bp.member_id is null, 'hcp', case when bp.member_id is null then bp.guest_hcp else m.hcp_index end)
                      order by bp.id)
                 from public.booking_players bp left join public.members m on m.id = bp.member_id
                where bp.slot_id = s.id), '[]'::jsonb))
           order by s.start_time)
      from public.tee_slots s
     where s.course_id = v_course and s.date = p_date), '[]'::jsonb);
end $$;

-- book_tee_time: guests may now include an optional "hcp".
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

-- ---------------------------------------------------------------- scorecards with guests

-- lineup: the card's players in order, each { "m": member id } or { "g": guest booking id }.
-- slot_id: the tee time the card was started from, if any.
alter table public.rounds add column lineup jsonb, add column slot_id bigint references public.tee_slots on delete set null;
update public.rounds set lineup = (select jsonb_agg(jsonb_build_object('m', p) order by o) from unnest(players) with ordinality u(p, o));
alter table public.rounds alter column lineup set not null,
  add constraint lineup_size check (jsonb_typeof(lineup) = 'array' and jsonb_array_length(lineup) between 1 and 4),
  drop column players;

revoke execute on function public.set_guest_handicap(bigint, numeric), public.get_guests(bigint[]) from public, anon;
grant execute on function public.set_guest_handicap(bigint, numeric), public.get_guests(bigint[]) to authenticated;
