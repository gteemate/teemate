-- Database tests: the 2-hour rule, and cards following bookings when one is deleted or someone withdraws. Rolled back.
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
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function t.done() returns void language plpgsql as $$ begin reset role; end $$;
grant execute on all functions in schema t to anon, authenticated;

insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'bc-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 4) i;
update public.members m set user_id = (select id from auth.users where email = 'bc-test-' || m.id || '@example.invalid') where m.id between 1 and 4;

-- Booking rules aren't what these tests are about: open every tee time they use (12 days ahead).
update public.club_settings set release_days = 13, release_weekends_only = false where id = 1;
-- Tee times well out of the way of real bookings: 08:00, 09:00, 09:50, 10:10, 12:00
insert into public.tee_slots (course_id, date, start_time) select 1, current_date + 12, x from unnest('{480,540,590,610,720}'::int[]) x;
create view t.slot as select id, start_time from public.tee_slots where date = current_date + 12;
grant select on t.slot to authenticated;

do $$ declare s8 bigint := (select id from t.slot where start_time = 480); s9 bigint := (select id from t.slot where start_time = 540);
  s950 bigint := (select id from t.slot where start_time = 590); s10 bigint := (select id from t.slot where start_time = 610);
  s12 bigint := (select id from t.slot where start_time = 720); e text; r jsonb; bk bigint; c1 bigint; c2 bigint; ev bigint; ev2 bigint; begin
  -- 2-hour rule
  perform t.act_as(1);
  bk := (public.book_tee_time(s8, '{2}')->>'id')::bigint;
  e := t.err(format('select public.book_tee_time(%s)', s9));
  perform t.ok('2 hours: I can''t book another time within 2 hours of mine', e like 'You''re already booked at 08:00%', e);
  e := t.err(format('select public.book_tee_time(%s)', s10));
  perform t.ok('2 hours: 2 hours 10 minutes later is fine', e is null, e);
  perform t.done();
  perform t.act_as(3);
  e := t.err(format('select public.book_tee_time(%s, ''{2}'')', s950));
  perform t.ok('2 hours: can''t book a buddy who is on a time within 2 hours', e like '% is already booked at 08:00%', e);
  e := t.err(format('select public.book_tee_time(%s, ''{2}'')', s12));
  perform t.ok('2 hours: the buddy can be booked 4 hours later', e is null, e);
  perform t.done();

  -- my bookings list the players
  perform t.act_as(2);
  r := (select x from jsonb_array_elements(public.get_my_bookings()) x where (x->>'id')::bigint = bk);
  perform t.ok('Details: my bookings list each player and who booked', jsonb_array_length(r->'people') = 2 and r->>'bookedBy' is not null and r->>'mine' = 'false', r::text);
  perform t.done();

  -- cards follow bookings. Aoife (2) started a card for the 08:00 with Declan; Declan started his own too.
  perform t.act_as(2);
  insert into public.rounds (lineup, scores, done, slot_id) values ('[{"m":2},{"m":1}]', '[]', (select jsonb_agg(false) from generate_series(1,18)), s8) returning id into c1;
  perform t.done();
  perform t.act_as(1);
  insert into public.rounds (lineup, scores, done, slot_id) values ('[{"m":1},{"m":2}]', '[]', (select jsonb_agg(n = 1) from generate_series(1,18) n), s8) returning id into c2;
  perform t.done();
  insert into public.player_events (date, created_by, style, format, team_names, players, status)
    values (current_date + 12, 1, 'fourball', 'best2', '{}', jsonb_build_array(jsonb_build_object('id', (select id from public.booking_players where slot_id = s8 and member_id = 2), 'memberId', 2)), 'pending') returning id into ev;
  perform t.act_as(1);
  r := public.cancel_booking(bk);
  perform t.done();
  perform t.ok('Events: deleting a booking calls off events with anyone from it',
    (select status = 'cancelled' and cancel_note like '% cancelled the 08:00 booking' from public.player_events where id = ev),
    (select cancel_note from public.player_events where id = ev));
  perform t.ok('Cards: deleting a booking removes the other player''s unstarted card for it', not exists (select 1 from public.rounds where id = c1), r::text);
  perform t.ok('Cards: a card with saved holes is kept', exists (select 1 from public.rounds where id = c2));

  -- withdrawing removes unstarted cards with me on them
  perform t.act_as(3);
  bk := (select (x->>'id')::bigint from jsonb_array_elements(public.get_my_bookings()) x where (x->>'time')::int = 720);
  insert into public.rounds (lineup, scores, done, slot_id) values ('[{"m":3},{"m":2}]', '[]', (select jsonb_agg(false) from generate_series(1,18)), s12) returning id into c1;
  perform t.done();
  -- an event with Aoife's group on the 12:00, and one she isn't in
  insert into public.player_events (date, created_by, style, format, team_names, players, status)
    values (current_date + 12, 3, 'fourball', 'best2', '{}', jsonb_build_array(jsonb_build_object('id', (select id from public.booking_players where slot_id = s12 and member_id = 2), 'memberId', 2)), 'accepted') returning id into ev;
  insert into public.player_events (date, created_by, style, format, team_names, players, status)
    values (current_date + 12, 3, 'fourball', 'best2', '{}', '[{"id": -1, "memberId": 4}]', 'accepted') returning id into ev2;
  perform t.act_as(2);
  r := public.cancel_booking(bk);
  perform t.ok('Cards: withdrawing removes the unstarted card I''m on', r->>'result' = 'withdrawn' and not exists (select 1 from public.rounds where id = c1), r::text);
  perform t.done();
  perform t.ok('Events: withdrawing calls off an event I''m in, saying why',
    (select status = 'cancelled' and cancel_note like '% withdrew from the 12:00' from public.player_events where id = ev),
    (select cancel_note from public.player_events where id = ev));
  perform t.ok('Events: an event I''m not in carries on', (select status from public.player_events where id = ev2) = 'accepted');
end $$;

select test, ok, detail from t.results order by n;
rollback;
