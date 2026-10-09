-- Tee time release: a day's tee times open for booking at a set moment (by default 8pm, 8 days before),
-- on UK time. Admins set the rule; book_tee_time() enforces it (admins can still book ahead).

alter table public.club_settings
  add column release_time time not null default '20:00',
  add column release_days int not null default 8 check (release_days between 1 and 13),
  add column release_weekends_only boolean not null default false;

/** When tee times on p_date open for booking; null = always open (a weekday when the rule is weekends only). */
create function public.tee_time_opens_at(p_date date) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select case when s.release_weekends_only and extract(isodow from p_date) < 6 then null
              else ((p_date - s.release_days) + s.release_time) at time zone 'Europe/London' end
    from public.club_settings s where s.id = 1
$$;

-- "8pm", "8.30pm", "12am"
create function public.release_time_label(p_time time) returns text
language sql immutable set search_path = '' as $$
  select lower(to_char(p_time, 'FMHH12') || case when extract(minute from p_time) <> 0 then '.' || to_char(p_time, 'MI') else '' end || to_char(p_time, 'am'))
$$;

/** "Tee times for Sat 17 Oct open at 8pm on Fri 9 Oct." */
create function public.not_open_message(p_date date) returns text
language sql stable security definer set search_path = '' as $$
  select format('Tee times for %s open at %s on %s.', to_char(p_date, 'Dy FMDD Mon'), public.release_time_label(s.release_time),
                to_char(p_date - s.release_days, 'Dy FMDD Mon'))
    from public.club_settings s where s.id = 1
$$;

/** For the Book tee times screen: the rule, and the database's clock (the countdown corrects the phone's by it). */
create function public.get_booking_rules() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('time', to_char(release_time, 'HH24:MI'), 'days', release_days, 'weekendsOnly', release_weekends_only, 'now', now())
    from public.club_settings where id = 1
$$;

create function public.admin_set_booking_rules(p_time time, p_days int, p_weekends_only boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change the booking rules.' using errcode = '42501';
  end if;
  if p_days is null or p_days not between 1 and 13 then
    raise exception 'Days ahead must be between 1 and 13.' using errcode = 'P0001';
  end if;
  update public.club_settings set release_time = date_trunc('minute', p_time), release_days = p_days, release_weekends_only = coalesce(p_weekends_only, false) where id = 1;
end $$;

-- Same as 20261009130000_book_locks_members.sql, plus the release check after "has passed".
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
  -- Not released yet (admins can book ahead for competitions and societies).
  if not public.is_admin() and public.tee_time_opens_at(v_slot.date) > now() then
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

revoke execute on function public.tee_time_opens_at(date), public.release_time_label(time), public.not_open_message(date),
  public.get_booking_rules(), public.admin_set_booking_rules(time, int, boolean) from public, anon;
grant execute on function public.tee_time_opens_at(date), public.release_time_label(time), public.not_open_message(date),
  public.get_booking_rules(), public.admin_set_booking_rules(time, int, boolean) to authenticated;
