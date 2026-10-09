-- Database tests: members entering club competitions themselves (events.self_entry). Rolled back.
begin;
create schema t;
create table t.results (n serial, test text, ok boolean, detail text);
create table t.ev (k text primary key, id bigint);
grant usage on schema t to anon, authenticated;
grant all on all tables in schema t to anon, authenticated;
grant all on all sequences in schema t to anon, authenticated;
create function t.ok(p_test text, p_ok boolean, p_detail text default null) returns void language sql as $$
  insert into t.results (test, ok, detail) values (p_test, coalesce(p_ok, false), p_detail) $$;
create function t.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return null; exception when others then return sqlerrm; end $$;
create function t.id(p_k text) returns bigint language sql as $$ select id from t.ev where k = p_k $$;
grant execute on all functions in schema t to anon, authenticated;

-- Test members of their own: an admin and two members.
insert into public.members (id, name) values (990301, 'Entry Admin'), (990302, 'Entry Member'), (990303, 'Entry Other');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'entry-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 3) i;
update public.members m set user_id = (select id from auth.users where email = 'entry-test-' || (m.id - 990300) || '@example.invalid'), admin = (m.id = 990301)
 where m.id between 990301 and 990303;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;

-- Club competitions: open for entry, not open, already started; and a league open for entry with a captain.
with e as (insert into public.events (name, start_date, style, fmt, club, everyone, self_entry, created_by) values
  ('Open Cup', current_date + 5, 'teams', 'teamstab', true, false, true, 990301),
  ('Invite Only', current_date + 5, 'teams', 'teamstab', true, false, false, 990301),
  ('Started Cup', current_date, 'teams', 'teamstab', true, false, true, 990301) returning id, name)
insert into t.ev select case name when 'Open Cup' then 'open' when 'Invite Only' then 'closed' else 'started' end, id from e;
with e as (insert into public.events (name, start_date, style, fmt, club, everyone, self_entry, created_by, weeks, best_of, league_teams, players, team, captain_pool)
  values ('Open League', current_date + 5, 'league', 'beststab', true, false, true, 990301, 6, 4,
          '[{"name":"Blues","captain":990303},{"name":"Reds"}]', '{990303}', '{"990303":0}', '{990303}') returning id)
insert into t.ev select 'league', id from e;

do $$ declare e text; begin
  perform t.act_as(990302);
  perform t.ok('Open: a member sees a club competition open for entry', exists (select 1 from public.events where id = t.id('open')));
  perform t.ok('Open: a member doesn''t see one that isn''t open for entry', not exists (select 1 from public.events where id = t.id('closed')));
  perform public.enter_event(t.id('open'));
  perform t.ok('Enter: the member is now an entrant', (select 990302 = any (players) from public.events where id = t.id('open')));
  perform public.enter_event(t.id('open'));
  perform t.ok('Enter twice: still entered once', (select count(*) from public.events e, unnest(e.players) p where e.id = t.id('open') and p = 990302) = 1);
  e := t.err(format('select public.enter_event(%s)', t.id('closed')));
  perform t.ok('Enter: refused when the competition isn''t open for entry', e like '%isn''t open for entry%', e);
  e := t.err(format('select public.enter_event(%s)', t.id('started')));
  perform t.ok('Enter: refused once it has started', e like '%has started%', e);
  perform public.withdraw_event(t.id('open'));
  perform t.ok('Withdraw: the member is off the entrants', not ((select 990302 = any (players) from public.events where id = t.id('open'))));
  reset role;

  perform t.act_as(990303); -- the league's captain withdraws
  perform public.withdraw_event(t.id('league'));
  perform t.ok('Withdraw from a league: off the entrants, the team and the candidates, and no longer captain',
    (select not (990303 = any (players)) and not (team ? '990303') and not (990303 = any (captain_pool)) and (league_teams->0->>'captain') is null
       from public.events where id = t.id('league')),
    (select row(players, team, captain_pool, league_teams)::text from public.events where id = t.id('league')));
  reset role;

  update public.events set self_entry = false where id = t.id('open');
  update public.events set players = '{990302}' where id = t.id('open');
  perform t.act_as(990302);
  e := t.err(format('select public.withdraw_event(%s)', t.id('open')));
  perform t.ok('Withdraw: only from competitions open for entry (otherwise ask an admin)', e like '%isn''t open for entry%', e);
  reset role;

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  e := t.err(format('select public.enter_event(%s)', t.id('open')));
  perform t.ok('Visitors can''t enter', e is not null, e);
  reset role;
end $$;

select test, ok, detail from t.results order by n;
rollback;
