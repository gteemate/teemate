-- Database tests: Row Level Security and book_tee_time().
-- Everything runs in one transaction that is rolled back, so real data is untouched.
-- Run with: node scripts/db.mjs test
begin;

-- Helpers live in a throwaway schema (dropped by the rollback).
create schema t;
create table t.results (n serial, test text, ok boolean, detail text);
create table t.users (member_id bigint primary key, uid uuid not null);
grant usage on schema t to anon, authenticated;
grant all on all tables in schema t to anon, authenticated;
grant all on all sequences in schema t to anon, authenticated;

-- Act as a member's login (or anon when member_id is null), like a request through the API would.
create function t.act_as(p_member bigint) returns void language plpgsql as $$
declare v uuid := (select uid from t.users where member_id = p_member);
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', case when v is null then 'anon' else 'authenticated' end)::text, true);
  execute format('set local role %s', case when v is null then 'anon' else 'authenticated' end);
end $$;
create function t.done() returns void language plpgsql as $$ begin reset role; end $$;
create function t.ok(p_test text, p_ok boolean, p_detail text default null) returns void language sql as $$
  insert into t.results (test, ok, detail) values (p_test, coalesce(p_ok, false), p_detail) $$;
-- Run SQL; return the error message, or null if it succeeded.
create function t.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return null; exception when others then return sqlerrm; end $$;
-- Players on a test tee time, as the tee sheet shows them to any member (not limited by RLS).
create function t.taken(p_slot bigint) returns int language sql as $$
  select jsonb_array_length(x->'players') from jsonb_array_elements(public.get_tee_sheet(current_date + 10)) x where (x->>'id')::bigint = p_slot $$;
create function t.val(p_sql text) returns bigint language plpgsql as $$
declare v bigint; begin execute p_sql into v; return v; end $$;
grant execute on all functions in schema t to anon, authenticated;

-- Test logins for: Gary (0, admin), Declan (1), Aoife (2, no guest points left), Ciarán (3).
insert into auth.users (id, email, aud, role)
  select gen_random_uuid(), 'rls-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(0, 3) i;
insert into t.users select i, (select id from auth.users where email = 'rls-test-' || i || '@example.invalid') from generate_series(0, 3) i;
update public.members m set user_id = u.uid from t.users u where m.id = u.member_id;
update public.members set admin = (id = 0) where id between 0 and 3; -- test roles: Gary is the admin here

-- Some tee times to book on, a few days out so nothing from the seed is on them.
insert into public.tee_slots (course_id, date, start_time) select 1, current_date + 10, 600 + 10 * i from generate_series(0, 9) i;
create view t.slot as select id, start_time from public.tee_slots where date = current_date + 10;
grant select on t.slot to anon, authenticated;

-- ------------------------------------------------------------------ anonymous visitors
do $$ begin
  perform t.act_as(null);
  perform t.ok('Anonymous: cannot read members', t.err('select count(*) from public.members') is not null);
  perform t.ok('Anonymous: cannot read rounds', t.err('select count(*) from public.rounds') is not null);
  perform t.ok('Anonymous: cannot open the tee sheet', t.err('select public.get_tee_sheet(current_date)') is not null);
  perform t.ok('Anonymous: cannot book', t.err('select public.book_tee_time((select min(id) from t.slot))') is not null);
  perform t.done();
end $$;

-- ------------------------------------------------------------------ an ordinary member (Declan)
do $$ declare e text; total bigint := (select count(*) from public.members); begin
  perform t.act_as(1);
  perform t.ok('Member: sees the member list', t.val('select count(*) from public.members') = total);
  perform t.ok('Member: cannot see emails', t.err('select email from public.members') is not null);
  perform t.ok('Member: cannot see another member''s buddies', t.val('select count(*) from public.buddies') = 0);
  perform t.ok('Member: can add own buddy', t.err('insert into public.buddies values (1, 9)') is null);
  perform t.ok('Member: cannot add buddies for someone else', t.err('insert into public.buddies values (0, 9)') is not null);
  perform t.ok('Member: cannot publish pins', t.err($q$insert into public.pin_sheets (course_id, date, pins) values (1, current_date + 1, '[]')$q$) is not null);
  perform t.ok('Member: cannot change games', t.err($q$insert into public.game_settings values ('skins', false, null)$q$) is not null);
  perform t.ok('Member: cannot edit events', t.val($q$with u as (update public.events set name = 'x' returning 1) select count(*) from u$q$) = 0);
  perform t.ok('Member: cannot write bookings directly', t.err('insert into public.bookings (slot_id, booked_by) values ((select min(id) from t.slot), 1)') is not null);
  perform t.ok('Member: cannot add guest points rows directly', t.err($q$insert into public.guest_visits (member_id, date, guest_name, course_id, points) values (1, current_date, 'x', 1, 0)$q$) is not null);
  perform t.ok('Member: sees only own guest points', t.val('select count(*) from public.guest_visits where member_id <> 1') = 0
                                                   and t.val('select count(*) from public.guest_visits') = 2);
  perform t.ok('Member: cannot edit someone else''s scorecard', t.val($q$with u as (update public.rounds set game = 'x' where created_by = 0 returning 1) select count(*) from u$q$) = 0);
  perform t.ok('Member: can start own scorecard', t.err($q$insert into public.rounds (lineup) values ('[{"m":1},{"m":2}]')$q$) is null);
  perform t.ok('My games: can save my own preference', t.err($q$insert into public.member_game_prefs values (1, 2, 'sm2')$q$) is null);
  perform t.ok('My games: cannot set someone else''s', t.err($q$insert into public.member_game_prefs values (0, 2, 'sm2')$q$) is not null);
  perform t.ok('My games: only see my own', t.val('select count(*) from public.member_game_prefs where member_id <> 1') = 0);
  perform t.ok('Member: cannot start a card as someone else', t.err($q$insert into public.rounds (created_by, lineup) values (0, '[{"m":0}]')$q$) is not null);
  perform t.done();
end $$;

-- ------------------------------------------------------------------ booking: spaces and double booking
do $$ declare s1 bigint := (select id from t.slot where start_time = 600); s2 bigint := (select id from t.slot where start_time = 610); r jsonb; e text; begin
  perform t.act_as(1);
  r := public.book_tee_time(s1, '{7}');
  perform t.ok('Booking: me + one member on an open tee', (r->>'id') is not null, r::text);
  perform t.ok('Booking: tee sheet shows 2 booked', t.taken(s1) = 2);
  perform t.ok('Booking: shows in my bookings', jsonb_array_length(public.get_my_bookings()) >= 1);
  e := t.err(format('select public.book_tee_time(%s)', s1));
  perform t.ok('Booking: same member twice on one time is refused', e like '%already booked%', e);
  perform t.done();
  perform t.act_as(2); -- Aoife isn't on this time
  e := t.err(format('select public.book_tee_time(%s, ''{9,10}'')', s1));
  perform t.ok('Booking: 3 players into 2 spaces is refused', e like '%spaces have just been taken%', e);
  perform t.ok('Booking: refused booking left nothing behind', t.taken(s1) = 2);
  perform t.done();
  perform t.act_as(0); -- Gary takes the last two spaces
  r := public.book_tee_time(s1, '{11}');
  perform t.ok('Booking: filling the last spaces works', t.taken(s1) = 4);
  perform t.done();
  perform t.act_as(2);
  e := t.err(format('select public.book_tee_time(%s)', s1));
  perform t.ok('Booking: a full tee time is refused', e like '%spaces have just been taken%', e);
  perform t.done();
  perform t.act_as(1);
  e := t.err(format('select public.book_tee_time(%s, ''{1}'')', s2));
  perform t.ok('Booking: a player listed twice is refused', e like '%listed twice%', e);
  e := t.err(format($q$select public.book_tee_time(%s, '{}', '[{"name":"Bad Gui","gui":"12"}]')$q$, s2));
  perform t.ok('Booking: bad guest GUI number is refused', e like '%6–10 digits%', e);
  perform t.done();
end $$;

-- The last line of defence even outside the function: one member, one place per tee time.
do $$ declare s1 bigint := (select id from t.slot where start_time = 600); begin
  perform t.ok('Backstop: database rejects a duplicate player row',
    t.err(format('insert into public.booking_players (booking_id, slot_id, member_id) select booking_id, slot_id, member_id from public.booking_players where slot_id = %s and member_id = 1', s1)) is not null);
end $$;

-- ------------------------------------------------------------------ guest points never go negative
do $$ declare e text; used int; i int; begin
  perform t.act_as(2); -- Aoife has used all 36 points this year
  e := t.err(format($q$select public.book_tee_time(%s, '{}', '[{"name":"G"}]')$q$, (select id from t.slot where start_time = 620)));
  perform t.ok('Points: member with 0 left cannot bring a guest', e like '%enough guest points%', e);
  perform t.ok('Points: refused booking took no space', t.taken((select id from t.slot where start_time = 620)) = 0);
  perform t.done();

  perform t.act_as(1); -- Declan has 30 left: three bookings of 3 guests (27), then 3 left
  for i in 0..2 loop
    perform public.book_tee_time((select id from t.slot where start_time = 630 + 10 * i), '{}', '[{"name":"A"},{"name":"B"},{"name":"C"}]');
  end loop;
  e := t.err(format($q$select public.book_tee_time(%s, '{}', '[{"name":"A"},{"name":"B"},{"name":"C"}]')$q$, (select id from t.slot where start_time = 660)));
  perform t.ok('Points: 3 guests with 3 points left is refused', e like '%enough guest points%', e);
  perform public.book_tee_time((select id from t.slot where start_time = 660), '{}', '[{"name":"D"}]');
  e := t.err(format($q$select public.book_tee_time(%s, '{}', '[{"name":"E"}]')$q$, (select id from t.slot where start_time = 670)));
  perform t.ok('Points: one more guest at 0 left is refused', e like '%enough guest points%', e);
  perform t.done();
  select sum(points) into used from public.guest_visits where member_id = 1 and date_trunc('year', date) = date_trunc('year', current_date + 10);
  perform t.ok('Points: used exactly the allowance (36), never more', used = 36, used::text);
  perform t.ok('Backstop: database rejects a points row that would overdraw',
    t.err($q$insert into public.guest_visits (member_id, date, guest_name, course_id, points) values (2, current_date, 'x', 1, 3)$q$) is not null);
end $$;

-- ------------------------------------------------------------------ guest handicaps
do $$ declare s3 bigint := (select id from t.slot where start_time = 690); r jsonb; gid bigint; e text; begin
  perform t.act_as(3); -- Ciarán books with Declan and two guests
  r := public.book_tee_time(s3, '{1}', '[{"name":"Sam Guest","hcp":18.5},{"name":"No Handicap Yet"}]');
  perform t.done();
  select id into gid from public.booking_players where slot_id = s3 and guest_name = 'Sam Guest';
  perform t.ok('Guest handicap: set when booking', (select guest_hcp from public.booking_players where id = gid) = 18.5);
  perform t.ok('Guest handicap: can be left blank', (select guest_hcp from public.booking_players where slot_id = s3 and guest_name = 'No Handicap Yet') is null);
  perform t.act_as(3);
  e := t.err(format($q$select public.book_tee_time(%s, '{}', '[{"name":"Silly","hcp":99}]')$q$, (select id from t.slot where start_time = 700)));
  perform t.ok('Guest handicap: out of range refused at booking', e like '%between +10 and 54%', e);
  perform t.done();
  perform t.act_as(1); -- Declan is in the same four-ball but didn't book the guest
  e := t.err(format('select public.set_guest_handicap(%s, 12.3)', gid));
  perform t.ok('Guest handicap: anyone in the four-ball can change it', e is null, e);
  perform t.ok('Guest handicap: shown on the tee sheet and to the card', (select (x->>'hcp')::numeric from jsonb_array_elements(public.get_guests(array[gid])) x) = 12.3);
  e := t.err(format('select public.set_guest_handicap(%s, -60)', gid));
  perform t.ok('Guest handicap: out of range refused', e like '%between +10 and 54%', e);
  perform t.done();
  perform t.act_as(2); -- Aoife isn't on that tee time
  e := t.err(format('select public.set_guest_handicap(%s, 5)', gid));
  perform t.ok('Guest handicap: someone not in the four-ball cannot', e like '%Only players on that tee time%', e);
  perform t.done();
  perform t.act_as(3);
  perform public.set_guest_handicap(gid, null);
  perform t.done();
  perform t.ok('Guest handicap: can be cleared again', (select guest_hcp from public.booking_players where id = gid) is null);
end $$;

-- ------------------------------------------------------------------ admin (Gary)
do $$ declare new_id bigint; begin
  perform t.act_as(0);
  perform t.ok('Admin: can publish pins', t.err($q$insert into public.pin_sheets (course_id, date, pins) values (1, current_date + 1, '[]')$q$) is null);
  perform t.ok('Admin: can change games', t.err($q$insert into public.game_settings values ('skins', false, null)$q$) is null);
  perform t.ok('Admin: sees everyone''s guest points', t.val('select count(distinct member_id) from public.guest_visits') > 2);
  insert into public.events (name, start_date, style, fmt, club) values ('Club Test', current_date + 5, 'teams', 'teamstab', true) returning id into new_id;
  perform t.ok('Admin: can create a club event', new_id is not null);
  perform t.done();
end $$;

-- ------------------------------------------------------------------ logins link to members by email
insert into public.members (name, email) values ('Link Test', 'link-test@example.invalid');
insert into auth.users (id, email, aud, role) values (gen_random_uuid(), 'Link-Test@example.invalid', 'authenticated', 'authenticated');
select t.ok('Login: new sign-in is linked to the member with that email',
  (select user_id from public.members where email = 'link-test@example.invalid') = (select id from auth.users where email = 'Link-Test@example.invalid'));
insert into auth.users (id, email, aud, role) values (gen_random_uuid(), 'stranger@example.invalid', 'authenticated', 'authenticated');
insert into t.users values (-1, (select id from auth.users where email = 'stranger@example.invalid'));
do $$ begin
  perform t.act_as(-1);
  perform t.ok('Login: someone not on the members list sees nothing', t.val('select count(*) from public.members') = 0
                                                                    and t.err('select public.get_tee_sheet(current_date)') is not null);
  perform t.done();
end $$;

select test, ok, detail from t.results order by n;
rollback;
