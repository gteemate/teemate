-- Database tests: one against one with a player in another group (challenge, answer, who can). Rolled back.
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

-- Logins for members 0–12 (those that exist); member 12 is the only admin.
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'sg-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(0, 12) i;
update public.members m set user_id = (select id from auth.users where email = 'sg-test-' || m.id || '@example.invalid') where m.id between 0 and 12;
update public.members set admin = (id = 12) where id between 0 and 12;

-- Tee times 12 days out. A: 1, 3, 7 + guest. B: 2, 4, 5 + guest. C: 6, 8. D: 9, 10. E: 11, 12.
create table t.slots (k text primary key, id bigint);
grant all on t.slots to authenticated;
with s as (insert into public.tee_slots (course_id, date, start_time) select 1, current_date + 12, 490 + 10 * i from generate_series(0, 4) i returning id, start_time)
insert into t.slots select chr(65 + (start_time - 490) / 10), id from s;
create function t.s(k text) returns bigint language sql as $$ select id from t.slots where t.slots.k = $1 $$;
create function t.book(p_slot text, p_member bigint, p_guest text default null) returns bigint language plpgsql as $$
declare b bigint; bp bigint;
begin
  insert into public.bookings (slot_id, booked_by) values (t.s(p_slot), coalesce(p_member, 1)) returning id into b;
  insert into public.booking_players (booking_id, slot_id, member_id, guest_name) values (b, t.s(p_slot), p_member, p_guest) returning id into bp;
  return bp;
end $$;
select t.book('A', 1), t.book('A', 3), t.book('A', 7), t.book('A', null, 'Guest Ann');
select t.book('B', 2), t.book('B', 4), t.book('B', 5), t.book('B', null, 'Guest Bob');
select t.book('C', 6), t.book('C', 8);
select t.book('D', 9), t.book('D', 10);
select t.book('E', 11), t.book('E', 12);
grant execute on all functions in schema t to authenticated;
create function t.bp(p_slot text, p_member bigint) returns bigint language sql security definer as $$
  select id from public.booking_players where slot_id = t.s(p_slot) and member_id = p_member $$;
grant execute on all functions in schema t to authenticated;

do $$ declare e text; v bigint; w bigint; begin
  perform t.act_as(1); -- on A
  e := t.err(format($q$select public.create_singles_match(%s, %s, 'kos')$q$, t.s('B'), t.bp('B', 2)));
  perform t.ok('Singles: only from your own tee time', e like '%your own tee time%', e);
  e := t.err(format($q$select public.create_singles_match(%s, %s, 'kos')$q$, t.s('A'), t.bp('A', 3)));
  perform t.ok('Singles: not someone on your own card', e like '%on your card%', e);
  e := t.err(format($q$select public.create_singles_match(%s, (select id from public.booking_players where guest_name = 'Guest Bob'), 'kos')$q$, t.s('A')));
  perform t.ok('Singles: a member, not a guest', e like '%member%', e);
  e := t.err(format($q$select public.create_singles_match(%s, %s, 'bbl')$q$, t.s('A'), t.bp('B', 2)));
  perform t.ok('Singles: a match play game only', e like '%match play%', e);

  v := public.create_singles_match(t.s('A'), t.bp('B', 2), 'kos');
  perform t.ok('Singles: challenge sent, two players, me on A', (select style = 'singles' and status = 'pending' and jsonb_array_length(players) = 2
     and (select x->>'team' from jsonb_array_elements(players) x where (x->>'memberId')::bigint = 1) = 'A' from public.player_events where id = v));
  perform t.ok('Singles: both tee times are in it', (select count(*) from public.player_event_groups where event_id = v) = 2);
  e := t.err(format($q$select public.create_singles_match(%s, %s, 'sc2')$q$, t.s('A'), t.bp('B', 2)));
  perform t.ok('Singles: only one with the same player a day', e like '%already have%', e);
  w := public.create_player_event(t.s('A'), array[t.s('C')], 'fourball', 'bestball');
  perform t.ok('Singles: the group can still take on another four-ball', w is not null);
  perform public.cancel_player_event(w);
  perform t.done();

  perform t.act_as(4); -- in B's group, but not the one asked
  e := t.err(format('select public.respond_player_event(%s, true)', v));
  perform t.ok('Singles: only the player challenged answers', e like '%been asked%', e);
  e := t.err(format($q$select public.counter_player_event(%s, 'fourball', 'all4')$q$, v));
  perform t.ok('Singles: can''t be changed by a counter-offer', e is not null, e);
  perform t.done();

  perform t.book('B', null, 'Late Guest'); -- a group changing doesn't matter to a one-on-one
  perform t.act_as(2);
  perform public.respond_player_event(v, true);
  perform t.done();
  perform t.ok('Singles: on once they accept', (select status from public.player_events where id = v) = 'accepted');

  perform t.act_as(6); -- C challenges D's 9, who declines
  v := public.create_singles_match(t.s('C'), t.bp('D', 9), 'sm2');
  perform t.done();
  perform t.act_as(9); perform public.respond_player_event(v, false); perform t.done();
  perform t.ok('Singles: declined', (select status from public.player_events where id = v) = 'declined');
end $$;

select test, ok, detail from t.results order by n;
rollback;
