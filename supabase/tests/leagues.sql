-- Database tests: leagues (set up by admins; players enter rounds before they play). Rolled back.
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

insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'lg-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(0, 9) i;
update public.members m set user_id = (select id from auth.users where email = 'lg-test-' || m.id || '@example.invalid') where m.id between 0 and 9;
update public.members set admin = (id = 5) where id between 0 and 9;
create table t.ids (k text primary key, id bigint);
grant all on t.ids to authenticated;

do $$ declare e text; lg bigint; r1 bigint; r2 bigint; w int; begin
  -- a league that started this week's Monday
  perform t.act_as(1);
  e := t.err($q$insert into public.events (name, start_date, style, fmt, weeks, best_of, league_teams, club, created_by) values ('Sneaky League', current_date, 'league', 'beststab', 6, 7, '[{"name":"A"},{"name":"B"}]', true, 1)$q$);
  perform t.ok('Setup: only admins can create a club league (members make leagues for their own group)', e is not null, e);
  perform t.done();

  perform t.act_as(5);
  insert into public.events (name, start_date, style, fmt, weeks, best_of, league_teams, players, team)
    values ('Winter League', current_date - extract(isodow from current_date)::int + 1, 'league', 'beststab', 6, 7,
            '[{"name":"Team 1"},{"name":"Team 2"}]', '{1,2,3,4}', '{"1":0,"2":0,"3":1,"4":1}') returning id into lg;
  perform t.ok('Setup: an admin can create a league', lg is not null);
  perform t.done();

  -- Captain candidates: saved with the league; captains are drawn from them in the app.
  perform t.act_as(5);
  update public.events set captain_pool = '{1,3,4}' where id = lg;
  perform t.ok('Captains: the candidate list is saved with the league', (select captain_pool from public.events where id = lg) = '{1,3,4}'::bigint[]);
  perform t.done();
  perform t.ok('Captains: a new league starts with no candidates',
    (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'events' and column_name = 'captain_pool') like '''{}''%');

  -- Declan's card with Declan and Aoife (both in), and Peter (not in the league)
  perform t.act_as(1);
  insert into public.rounds (lineup, scores, done) values ('[{"m":1},{"m":2},{"m":7}]', '[]', (select jsonb_agg(false) from generate_series(1,18))) returning id into r1;
  w := public.enter_league(r1, lg, '{1,2}');
  perform t.ok('Enter: players on my card enter before they play', w = 1 and (select count(*) from public.league_entries where round_id = r1) = 2, w::text);
  e := t.err(format('select public.enter_league(%s, %s, ''{7}'')', r1, lg));
  perform t.ok('Enter: someone not in the league cannot be entered', e like '%isn''t in the league%', e);
  -- a second card the same week
  insert into public.rounds (lineup, scores, done) values ('[{"m":1}]', '[]', (select jsonb_agg(false) from generate_series(1,18))) returning id into r2;
  e := t.err(format('select public.enter_league(%s, %s, ''{1}'')', r2, lg));
  perform t.ok('Enter: only one entered round per player per week', e like '%already entered a round this week%', e);
  -- change of mind before teeing off
  perform public.leave_league(r1, lg, '{2}');
  perform t.ok('Enter: can take a player off before the first hole', (select count(*) from public.league_entries where round_id = r1) = 1);
  perform public.enter_league(r1, lg, '{2}');
  update public.rounds set done = jsonb_set(done, '{0}', 'true') where id = r1;
  e := t.err(format('select public.leave_league(%s, %s, ''{2}'')', r1, lg));
  perform t.ok('Enter: locked once the first hole is saved', e like '%locked%', e);
  insert into public.rounds (lineup, scores, done) values ('[{"m":1},{"m":2}]', '[]', (select jsonb_agg(n = 1) from generate_series(1,18) n)) returning id into r2;
  e := t.err(format('select public.enter_league(%s, %s, ''{1}'')', r2, lg));
  perform t.ok('Enter: a card that has started cannot be entered', e like '%before the first hole%', e);
  perform t.done();

  perform t.act_as(3);
  e := t.err(format('select public.enter_league(%s, %s, ''{3}'')', r1, lg));
  perform t.ok('Enter: only from a card you are on', e like '%a card you''re on%', e);
  perform t.ok('See: a league player sees the entries', (select count(*) from public.league_entries where event_id = lg) = 2);
  perform t.done();

  -- One card per group: Aoife (on Declan's card) can save holes and answer for it; Ciara can't; only Declan deletes.
  perform t.act_as(1);
  insert into public.rounds (lineup, scores, done) values ('[{"m":1},{"m":4}]', '[]', (select jsonb_agg(false) from generate_series(1,18))) returning id into r2;
  perform t.done();
  perform t.act_as(4);
  update public.rounds set game = 'stab', done = jsonb_set(done, '{0}', 'true') where id = r2;
  perform t.ok('Shared card: a player on the card can save to it', (select game = 'stab' and done->>0 = 'true' from public.rounds where id = r2));
  perform t.done();
  perform t.act_as(3);
  update public.rounds set game = 'skins' where id = r2;
  perform t.ok('Shared card: someone not on it cannot change it', (select game from public.rounds where id = r2) = 'stab');
  perform t.done();
  perform t.act_as(4);
  delete from public.rounds where id = r2;
  perform t.ok('Shared card: any player on it can delete it, not only the starter', (select count(*) from public.rounds where id = r2) = 0);
  perform t.done();
  perform t.act_as(3);
  insert into public.rounds (lineup, scores, done) values ('[{"m":3},{"m":4}]', '[]', (select jsonb_agg(false) from generate_series(1,18))) returning id into r2;
  perform t.done();
  perform t.act_as(4);
  perform public.enter_league(r2, lg, '{3,4}');
  perform t.ok('Shared card: any player on the card can answer the league question', (select count(*) from public.league_entries where round_id = r2) = 2);
  perform t.done();
  perform t.act_as(9);
  perform t.ok('See: someone not in the league sees neither it nor its entries',
    (select count(*) from public.events where id = lg) = 0 and (select count(*) from public.league_entries where event_id = lg) = 0);
  perform t.done();
end $$;

select test, ok, detail from t.results order by n;
rollback;
