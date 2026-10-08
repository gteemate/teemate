-- Database tests: player events with several groups (propose, answer, who can see them). Rolled back.
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

-- Logins for members 0–12; member 0 is the only admin.
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'pe-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(0, 12) i;
update public.members m set user_id = (select id from auth.users where email = 'pe-test-' || m.id || '@example.invalid') where m.id between 0 and 12;
update public.members set admin = (id = 0) where id between 0 and 12;

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
-- Team picks keyed by booking player id.
create function t.teams(p_slots text[], p_rule text) returns jsonb language sql security definer as $$ -- sees every booking, whoever's acting
  select jsonb_object_agg(id::text, case
           when p_rule = 'ryder' then case when rn <= 2 then 'A' else 'B' end   -- first two of each four-ball on A
           when p_rule = 'alternate' then case when gn % 2 = 1 then 'A' else 'B' end
           else 'A' end)
    from (select bp.id, row_number() over (partition by bp.slot_id order by bp.id) rn, row_number() over (order by bp.id) gn
            from public.booking_players bp where bp.slot_id in (select t.s(x) from unnest(p_slots) x)) p $$;
grant execute on all functions in schema t to authenticated;

do $$ declare e text; v bigint; ab bigint[] := array[t.s('B')]; names jsonb := '{"A":"Blues","B":"Reds"}'; begin
  -- proposing
  perform t.act_as(2); -- on B, not A
  e := t.err(format($q$select public.create_player_event(%s, '{%s}', 'fourball', 'best2')$q$, t.s('A'), t.s('C')));
  perform t.ok('Propose: only from your own tee time', e like '%your own tee time%', e);
  perform t.done();

  perform t.act_as(1); -- on A
  e := t.err(format($q$select public.create_player_event(%s, '{}', 'fourball', 'best2')$q$, t.s('A')));
  perform t.ok('Propose: needs at least one other group', e like '%at least one other group%', e);
  e := t.err(format($q$select public.create_player_event(%s, '{%s,%s}', 'fourball', 'bestball')$q$, t.s('A'), t.s('B'), t.s('C')));
  perform t.ok('Propose: match play needs exactly two groups', e like '%exactly two groups%', e);
  e := t.err(format($q$select public.create_player_event(%s, '{%s,%s}', 'ryder', 'bbl', '%s', '%s')$q$, t.s('A'), t.s('B'), t.s('C'), names, t.teams(array['A','B','C'], 'ryder')));
  perform t.ok('Propose: Ryder Cup needs full four-balls', e like '%full four-balls%', e);
  e := t.err(format($q$select public.create_player_event(%s, '{%s}', 'ryder', 'bbl', '%s', '%s')$q$, t.s('A'), t.s('B'), names, t.teams(array['A','B'], 'all-A')));
  perform t.ok('Propose: Ryder Cup needs two of each team in every four-ball', e like '%two players on each team%', e);
  e := t.err(format($q$select public.create_player_event(%s, '{%s}', 'teams', 'teamstab', '%s', '%s')$q$, t.s('A'), t.s('C'), names, t.teams(array['A','C'], 'all-A')));
  perform t.ok('Propose: own teams must be the same size', e like '%same number of players%', e);
  e := t.err(format($q$select public.create_player_event(%s, '{%s}', 'teams', 'bbl', '%s', '%s')$q$, t.s('A'), t.s('C'), names, t.teams(array['A','C'], 'alternate')));
  perform t.ok('Propose: format must suit the style', e is not null, e);

  v := public.create_player_event(t.s('A'), array[t.s('B'), t.s('C')], 'fourball', 'best2', format('{"%s":"Cochrane''s lot"}', t.s('A'))::jsonb);
  perform t.ok('Propose: four-ball v four-ball with three groups', v is not null);
  perform t.ok('Propose: each group is a team, named by tee time unless renamed',
    (select team_names->>(t.s('A')::text) = 'Cochrane''s lot' and team_names->>(t.s('B')::text) = '08:20' from public.player_events where id = v));
  perform t.ok('Propose: snapshot has all 10 players', (select jsonb_array_length(players) from public.player_events where id = v) = 10);
  e := t.err(format($q$select public.create_player_event(%s, '{%s}', 'fourball', 'all4')$q$, t.s('A'), t.s('D')));
  perform t.ok('Propose: a group can only be in one live event', e like '%already in an event%', e);
  perform t.done();

  -- who can see it
  perform t.act_as(8);  perform t.ok('See: a player in an invited group can', (select count(*) from public.player_events where id = v) = 1
                                                                        and (select count(*) from public.player_event_groups where event_id = v) = 3); perform t.done();
  perform t.act_as(9);  perform t.ok('See: someone in none of the groups cannot', (select count(*) from public.player_events where id = v) = 0); perform t.done();
  perform t.act_as(0);  perform t.ok('See: an admin can', (select count(*) from public.player_events where id = v) = 1); perform t.done();
  perform t.act_as(4);  perform t.ok('Write: no direct edits', t.err(format($q$update public.player_events set status = 'accepted' where id = %s$q$, v)) is not null); perform t.done();

  -- every invited group must accept
  perform t.act_as(3);
  e := t.err(format('select public.respond_player_event(%s, true)', v));
  perform t.ok('Answer: the host group cannot answer', e like '%Only an invited group%', e);
  perform t.done();
  perform t.act_as(4); perform public.respond_player_event(v, true); perform t.done();
  perform t.ok('Answer: one group accepting is not enough', (select status from public.player_events where id = v) = 'pending');
  perform t.act_as(5);
  e := t.err(format('select public.respond_player_event(%s, true)', v));
  perform t.ok('Answer: each group answers once', e like '%already been answered%', e);
  perform t.done();
  perform t.act_as(6); perform public.respond_player_event(v, true); perform t.done();
  perform t.ok('Answer: on once every invited group accepts', (select status from public.player_events where id = v) = 'accepted');

  -- cancel
  perform t.act_as(3);
  perform t.ok('Cancel: only the person who proposed it', t.err(format('select public.cancel_player_event(%s)', v)) like '%Only the person who proposed%');
  perform t.done();
  perform t.act_as(1); perform public.cancel_player_event(v); perform t.done();
  perform t.ok('Cancel: proposer can', (select status from public.player_events where id = v) = 'cancelled');

  -- Ryder Cup, own teams, and one decline stops it
  perform t.act_as(1);
  v := public.create_player_event(t.s('A'), ab, 'ryder', 'bbstab', names, t.teams(array['A','B'], 'ryder'));
  perform t.ok('Ryder Cup: valid teams accepted', v is not null);
  perform public.cancel_player_event(v);
  v := public.create_player_event(t.s('A'), array[t.s('C'), t.s('D')], 'teams', 'teamstab', names, t.teams(array['A','C','D'], 'alternate'));
  perform t.ok('Own teams: equal teams picked freely across groups', v is not null);
  perform t.done();
  perform t.act_as(6); perform public.respond_player_event(v, true); perform t.done();
  perform t.act_as(10); perform public.respond_player_event(v, false); perform t.done();
  perform t.ok('Answer: one group declining stops it', (select status from public.player_events where id = v) = 'declined');

  -- groups changed after proposing
  perform t.act_as(9);
  v := public.create_player_event(t.s('D'), array[t.s('E')], 'fourball', 'bestball');
  perform t.done();
  perform t.book('E', null, 'Late Guest');
  perform t.act_as(11);
  e := t.err(format('select public.respond_player_event(%s, true)', v));
  perform t.ok('Answer: refused if the groups changed since proposing', e like '%groups have changed%', e);
  perform t.done();
end $$;

select test, ok, detail from t.results order by n;
rollback;
