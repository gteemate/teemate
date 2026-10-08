-- Database tests: player events (propose, accept/decline, who can see them). Rolled back.
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

-- Logins for members 0–10; member 0 is the only admin.
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'pe-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(0, 10) i;
update public.members m set user_id = (select id from auth.users where email = 'pe-test-' || m.id || '@example.invalid') where m.id between 0 and 10;
update public.members set admin = (id = 0) where id between 0 and 10;

-- Four tee times 12 days out. A (08:10): 1, 3 + guest. B (08:20): 2, 4, 5 + guest. C, D for other cases.
create table t.slots (k text primary key, id bigint);
grant all on t.slots to authenticated;
with s as (insert into public.tee_slots (course_id, date, start_time) values (1, current_date + 12, 490), (1, current_date + 12, 500), (1, current_date + 12, 510), (1, current_date + 12, 520) returning id, start_time)
insert into t.slots select case start_time when 490 then 'A' when 500 then 'B' when 510 then 'C' else 'D' end, id from s;
create function t.book(p_slot text, p_member bigint, p_guest text default null) returns bigint language plpgsql as $$
declare b bigint; s bigint := (select id from t.slots where k = p_slot); bp bigint;
begin
  insert into public.bookings (slot_id, booked_by) values (s, coalesce(p_member, 1)) returning id into b;
  insert into public.booking_players (booking_id, slot_id, member_id, guest_name) values (b, s, p_member, p_guest) returning id into bp;
  return bp;
end $$;
select t.book('A', 1), t.book('A', 3), t.book('A', 7), t.book('A', null, 'Guest Ann');
select t.book('B', 2), t.book('B', 4), t.book('B', 5), t.book('B', null, 'Guest Bob');
select t.book('C', 6), t.book('C', 8);
select t.book('D', 9), t.book('D', 10);
-- Ryder teams: in each four-ball, the first two players booked are team A.
create table t.teams as select jsonb_object_agg(bp.id::text, case when rn <= 2 then 'A' else 'B' end) as teams
  from (select bp.id, row_number() over (partition by bp.slot_id order by bp.id) rn from public.booking_players bp where bp.slot_id in (select id from t.slots where k in ('A', 'B'))) bp;
grant select on t.teams to authenticated;

do $$ declare e text; v bigint; sa bigint := (select id from t.slots where k = 'A'); sb bigint := (select id from t.slots where k = 'B');
  sc bigint := (select id from t.slots where k = 'C'); sd bigint := (select id from t.slots where k = 'D'); teams jsonb := (select teams from t.teams);
  names jsonb := '{"A":"Blues","B":"Reds"}';
begin
  -- proposing
  perform t.act_as(2); -- Aoife is on B, not A
  e := t.err(format($q$select public.create_player_event(%s, %s, 'fourball', 'best2', '%s')$q$, sa, sb, names));
  perform t.ok('Propose: only from your own tee time', e like '%your own tee time%', e);
  perform t.done();

  perform t.act_as(1); -- Declan is on A
  e := t.err(format($q$select public.create_player_event(%s, %s, 'ryder', 'bbl', '%s', '{}')$q$, sa, sb, names));
  perform t.ok('Propose: Ryder Cup needs everyone on a team', e like '%two players from each four-ball%', e);
  e := t.err(format($q$select public.create_player_event(%s, %s, 'ryder', 'bbl', '{"A":"Blues","B":""}', '%s')$q$, sa, sb, teams));
  perform t.ok('Propose: both teams need a name', e like '%Give both teams a name%', e);
  e := t.err(format($q$select public.create_player_event(%s, %s, 'ryder', 'bestball', '%s', '%s')$q$, sa, sb, names, teams));
  perform t.ok('Propose: format must suit the style', e is not null, e);
  e := t.err(format($q$select public.create_player_event(%s, %s, 'ryder', 'bbl', '%s', '%s')$q$, sa, sc, names, teams));
  perform t.ok('Propose: Ryder Cup needs two full four-balls', e like '%two full four-balls%', e);
  v := public.create_player_event(sa, sb, 'ryder', 'bbl', names, teams);
  perform t.ok('Propose: valid Ryder Cup invitation is created', v is not null);
  perform t.ok('Propose: snapshot has all 8 players with teams', (select jsonb_array_length(players) = 8
     and (select count(*) from jsonb_array_elements(players) x where x->>'team' = 'A') = 4 from public.player_events where id = v));
  e := t.err(format($q$select public.create_player_event(%s, %s, 'fourball', 'best2', '%s')$q$, sa, sd, names));
  perform t.ok('Propose: a group can only be in one event at a time', e like '%already in an event%', e);
  perform t.done();

  -- who can see it
  perform t.act_as(5); perform t.ok('See: a player in the invited group can', (select count(*) from public.player_events where id = v) = 1); perform t.done();
  perform t.act_as(6); perform t.ok('See: someone in neither group cannot', (select count(*) from public.player_events where id = v) = 0); perform t.done();
  perform t.act_as(0); perform t.ok('See: an admin can', (select count(*) from public.player_events where id = v) = 1); perform t.done();
  perform t.act_as(4); perform t.ok('Write: no direct edits', t.err(format('update public.player_events set status = %L where id = %s', 'accepted', v)) is not null); perform t.done();

  -- answering
  perform t.act_as(3); -- on A, the inviting side
  e := t.err(format('select public.respond_player_event(%s, true)', v));
  perform t.ok('Answer: the inviting group cannot accept its own invitation', e like '%Only the invited group%', e);
  perform t.done();
  perform t.act_as(4); -- on B
  perform public.respond_player_event(v, true);
  perform t.done();
  perform t.ok('Answer: anyone in the invited group can accept', (select status = 'accepted' and responded_by = 4 from public.player_events where id = v));
  perform t.act_as(5);
  e := t.err(format('select public.respond_player_event(%s, false)', v));
  perform t.ok('Answer: only once', e like '%already been answered%', e);
  perform t.done();

  -- cancelling
  perform t.act_as(3);
  e := t.err(format('select public.cancel_player_event(%s)', v));
  perform t.ok('Cancel: only the person who proposed it', e like '%Only the person who proposed%', e);
  perform t.done();
  perform t.act_as(1);
  perform public.cancel_player_event(v);
  perform t.done();
  perform t.ok('Cancel: proposer can, and the groups are free again', (select status from public.player_events where id = v) = 'cancelled');

  -- four-ball v four-ball, declined
  perform t.act_as(6); -- on C
  v := public.create_player_event(sc, sd, 'fourball', 'all4', '{"A":"08:30","B":"08:40"}');
  perform t.done();
  perform t.act_as(9);
  perform public.respond_player_event(v, false);
  perform t.done();
  perform t.ok('Four-ball v four-ball: declined', (select status from public.player_events where id = v) = 'declined');

  -- groups changed after proposing
  perform t.act_as(6);
  v := public.create_player_event(sc, sd, 'fourball', 'bestball', '{"A":"08:30","B":"08:40"}');
  perform t.done();
  perform t.book('D', null, 'Late Guest');
  perform t.act_as(10);
  e := t.err(format('select public.respond_player_event(%s, true)', v));
  perform t.ok('Answer: refused if the groups changed since proposing', e like '%groups have changed%', e);
  perform t.done();
end $$;

select test, ok, detail from t.results order by n;
rollback;
