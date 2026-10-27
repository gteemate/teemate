-- Database tests: booking a club singles match (1 v 1, a club knockout or a club event) holds the other places on the
-- tee time for the match, so nobody else can book them. Rolled back.
begin;
create schema t;
create table t.results (n serial, test text, ok boolean, detail text);
grant usage on schema t to anon, authenticated;
grant all on all tables in schema t to anon, authenticated;
grant all on all sequences in schema t to anon, authenticated;
create function t.ok(p_test text, p_ok boolean, p_detail text default null) returns void language sql as $$
  insert into t.results (test, ok, detail) values (p_test, coalesce(p_ok, false), p_detail) $$;
create function t.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return null; exception when others then return sqlerrm; end $$;
grant execute on all functions in schema t to anon, authenticated;

insert into public.members (id, name) values (996001, 'Office Admin H'), (996002, 'Pat Reid'), (996003, 'Chris Lowe'), (996004, 'Jo Banks'), (996005, 'Sam Doyle');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'mh-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 5) i;
update public.members m set user_id = (select id from auth.users where email = 'mh-' || (m.id - 996000) || '@example.invalid'), admin = (m.id in (996001, 996002, 996004)) where m.id between 996001 and 996005;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;
create function t.slot(p_time int) returns bigint language sql as $$
  select id from public.tee_slots where date = current_date + 23 and start_time = p_time order by course_id limit 1 $$;
grant execute on all functions in schema t to authenticated;

-- A club singles knockout with Pat v Chris; a members' own knockout and a club pairs knockout with Pat v Chris too.
insert into public.signup_comps (id, name, category, kind, closes_on, created_by) values
  (996101, 'Autumn Knockout', 'open', 'singles', current_date - 30, null),
  (996102, 'Pat''s Knockout', 'open', 'singles', current_date - 30, 996002),
  (996103, 'Autumn Fourballs', 'open', 'pairs', current_date - 30, null);
insert into public.signup_entries (id, comp_id, member_id, partner_id) values
  (996201, 996101, 996002, null), (996202, 996101, 996003, null),
  (996203, 996102, 996002, null), (996204, 996102, 996003, null),
  (996205, 996103, 996002, 996004), (996206, 996103, 996003, 996005);
insert into public.ko_matches (id, comp_id, round, slot, a_entry, b_entry, status) values
  (996301, 996101, 1, 0, 996201, 996202, 'open'),
  (996302, 996102, 1, 0, 996203, 996204, 'open'),
  (996303, 996103, 1, 0, 996205, 996206, 'open');

do $$ declare r jsonb; v_b bigint; s1 bigint; s2 bigint; s3 bigint; s4 bigint; e text; v_cap int; v_sheet jsonb; v_ev bigint; begin
  perform t.act_as(996001);
  perform public.get_tee_sheet(current_date + 23);
  reset role;
  s1 := t.slot(600); s2 := t.slot(840); s3 := t.slot(480); s4 := t.slot(900);
  v_cap := (select capacity from public.tee_slots where id = s1);

  perform t.act_as(996002);
  r := public.book_club_match(s1, 996003, 'ko', 996101);
  reset role;
  v_b := (r->>'id')::bigint;
  perform t.ok('Hold: a club knockout singles match holds the other places',
    (select held from public.bookings where id = v_b) = v_cap - 2 and (select held_for from public.bookings where id = v_b) = 'Autumn Knockout match'
    and (select count(*) from public.booking_players where booking_id = v_b) = 2, r::text);
  perform t.ok('Hold: the opponent is told who booked them in',
    exists (select 1 from public.booking_notices where member_id = 996003 and kind = 'added' and booking_id = v_b));

  perform t.act_as(996003);
  e := t.err(format('select public.book_club_match(%s, 996002, ''ko'', 996101)', s2));
  reset role;
  perform t.ok('Hold: a match can only hold one tee time', e like 'Your Autumn Knockout match is already booked%', e);

  perform t.act_as(996004);
  v_sheet := (select x from jsonb_array_elements(public.get_tee_sheet(current_date + 23)) x where (x->>'id')::bigint = s1);
  e := t.err(format('select public.book_tee_time(%s)', s1));
  reset role;
  perform t.ok('Hold: the tee sheet shows the held places and what they''re for',
    (v_sheet->>'held')::int = v_cap - 2 and v_sheet->>'heldFor' = 'Autumn Knockout match', v_sheet::text);
  perform t.ok('Hold: nobody else can book the held places', e = 'Sorry, those spaces have just been taken. Pick another time.', e);

  perform t.act_as(996003);
  e := t.err(format('select public.add_to_booking(%s, array[996005]::bigint[], ''[]'')', v_b));
  perform t.ok('Hold: the bookings list shows the held places',
    (select (x->>'held')::int from jsonb_array_elements(public.get_my_bookings()) x where (x->>'id')::bigint = v_b) = v_cap - 2);
  reset role;
  perform t.ok('Hold: no players can be added to a held match', e = 'This time is held for the Autumn Knockout match.', e);

  perform t.act_as(996004);
  e := t.err(format('select public.book_club_match(%s, 996003, ''ko'', 996101)', s2));
  reset role;
  perform t.ok('Hold: only the players in the match can book it', e = 'That isn''t your match.', e);

  perform t.act_as(996002);
  e := t.err(format('select public.book_club_match(%s, 996003, ''ko'', 996102)', s2));
  reset role;
  perform t.ok('Hold: a members'' own knockout doesn''t hold places', e = 'Only club singles matches hold the other places.', e);
  perform t.act_as(996002);
  e := t.err(format('select public.book_club_match(%s, 996003, ''ko'', 996103)', s2));
  reset role;
  perform t.ok('Hold: a pairs match doesn''t hold places', e = 'Only club singles matches hold the other places.', e);

  -- The office moves it: the hold goes with it.
  perform t.act_as(996001);
  r := public.admin_move_booking(v_b, s3, '');
  reset role;
  perform t.ok('Hold: an office move takes the held places with it',
    (select held from public.bookings where id = (r->>'id')::bigint) = v_cap - 2
    and (select held_for from public.bookings where id = (r->>'id')::bigint) = 'Autumn Knockout match', r::text);
  v_b := (r->>'id')::bigint;

  -- Chris withdraws: it isn't a match of two any more, so the places open up.
  perform t.act_as(996003);
  perform public.cancel_booking(v_b);
  reset role;
  perform t.ok('Hold: when a player withdraws the held places open up',
    (select held from public.bookings where id = v_b) = 0, (select row_to_json(b)::text from public.bookings b where id = v_b));

  -- A club event's singles match.
  insert into public.events (name, style, fmt, start_date, team_a, team_b, course, format, club, matches)
    values ('Spring Cup', 'ryder', 'bbl', current_date + 23, '{"name":"Blues"}', '{"name":"Reds"}', 'Ailsa', 'singles', true, '{"1": [{"a": [996004], "b": [996005]}]}') returning id into v_ev;
  perform t.act_as(996004);
  r := public.book_club_match(s4, 996005, 'event', v_ev);
  reset role;
  perform t.ok('Hold: a club event''s singles match holds the other places too',
    (select held_for from public.bookings where id = (r->>'id')::bigint) = 'Spring Cup match', r::text);
end $$;

select test, ok, detail from t.results order by n;
rollback;
