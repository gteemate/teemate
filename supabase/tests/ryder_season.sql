-- Database tests: four-ball team match play over a season (save_season, entering a card on a match day). Rolled back.
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

insert into public.members (id, name, hcp_index) values (0, 'Gary', 12.4) on conflict (id) do nothing;
insert into public.members (id, name, hcp_index) select i, 'Season ' || i, 10 from generate_series(1, 6) i on conflict (id) do nothing;
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'season-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(0, 6) i;
update public.members m set user_id = (select id from auth.users where email = 'season-test-' || m.id || '@example.invalid') where m.id between 0 and 6;
update public.members set admin = (id = 0), office = false where id between 0 and 6;
create table t.ev (id bigint);
grant all on t.ev to authenticated;

-- Member 1's season: started 3 days ago (day 1 played), 120 days long, a four-ball today (day 4).
with e as (insert into public.events (name, start_date, days, season, style, fmt, players, team, matches, entry_required, created_by)
  values ('Pals Season', current_date - 3, 120, true, 'ryder', 'bbl', '{1,2,3,4}', '{"1":"A","2":"A","3":"B","4":"B"}',
          '{"1":[{"a":[1,2],"b":[3,4]}],"4":[{"a":[1],"b":[3]}]}', true, 1) returning id)
insert into t.ev select id from e;

do $$ declare v bigint := (select id from t.ev); e text;
  team0 jsonb := '{"1":"A","2":"A","3":"B","4":"B"}';
  past jsonb := '[{"a":[1,2],"b":[3,4]}]';
  today jsonb := '[{"a":[1],"b":[3]}]';
  s text := 'select public.save_season(%s, %L::date, %L::jsonb, %L::jsonb)';
begin
  -- the checks
  e := t.err($q$insert into public.events (name, start_date, days, season, style, fmt) values ('Bad', current_date, 30, true, 'teams', 'teamstab')$q$);
  perform t.ok('Check: only four-ball team match play can be a season', e is not null, e);
  e := t.err($q$insert into public.events (name, start_date, days, style, fmt) values ('Long', current_date, 4, 'ryder', 'bbl')$q$);
  perform t.ok('Check: a one-off is still 1–3 days', e is not null, e);

  perform t.act_as(1);
  e := t.err(format(s, v, current_date + 116, team0, jsonb_build_object('1', past, '4', today, '10', '[{"a":[1,2],"b":[3,4]},{"a":[],"b":[]}]'::jsonb)));
  perform t.ok('Refuse: a match that isn''t 2 v 2 or 1 v 1', e is not null, e);
  e := t.err(format(s, v, current_date + 116, team0, jsonb_build_object('1', past, '4', today, '10', '[{"a":[1,2],"b":[3,4]},{"a":[1],"b":[3]}]'::jsonb)));
  perform t.ok('Refuse: a player in two matches on a day', e like '%two matches%', e);
  e := t.err(format(s, v, current_date + 116, team0, jsonb_build_object('1', past, '4', today, '10', '[{"a":[1,3],"b":[2,4]}]'::jsonb)));
  perform t.ok('Refuse: a pair from both teams', e is not null, e);
  e := t.err(format(s, v, current_date + 116, team0, jsonb_build_object('1', '[{"a":[1],"b":[3]}]'::jsonb, '4', today)));
  perform t.ok('Refuse: changing a past match day', e like '%has started%', e);
  e := t.err(format(s, v, current_date + 116, team0, jsonb_build_object('4', today)));
  perform t.ok('Refuse: removing a past match day', e like '%has started%', e);
  e := t.err(format(s, v, current_date + 116, team0, jsonb_build_object('1', past, '4', today, '2', today)));
  perform t.ok('Refuse: adding a match day in the past', e is not null, e);
  e := t.err(format(s, v, current_date + 116, '{"1":"A","2":"B","3":"B","4":"A"}', jsonb_build_object('1', past, '4', today)));
  perform t.ok('Refuse: a player switching teams', e like '%change teams%', e);
  e := t.err(format(s, v, current_date + 116, '{"1":"A","3":"B","4":"B"}', jsonb_build_object('1', '[{"a":[1,2],"b":[3,4]}]'::jsonb, '4', today)));
  perform t.ok('Refuse: taking out a player who has played', e is not null, e);
  e := t.err(format(s, v, current_date + 5, team0, jsonb_build_object('1', past, '4', today, '10', '[{"a":[2],"b":[4]}]'::jsonb)));
  perform t.ok('Refuse: an end date before a match day', e like '%end date%', e);

  e := t.err(format(s, v, current_date + 116, team0 || '{"5":"A","6":"B"}', jsonb_build_object('1', past, '4', today, '10', '[{"a":[1,2],"b":[3,4]},{"a":[5],"b":[6]}]'::jsonb)));
  perform t.ok('Save: add players to each team and a match day with a four-ball and a singles', e is null, e);
  perform t.ok('Save: the new players are in the event on their teams',
    (select players @> '{5,6}' and team->>'5' = 'A' and team->>'6' = 'B' from public.events where id = v));
  e := t.err(format(s, v, current_date + 60, team0 || '{"5":"A","6":"B"}', jsonb_build_object('1', past, '4', '[{"a":[1,2],"b":[3,4]}]'::jsonb, '10', '[{"a":[5],"b":[6]}]'::jsonb)));
  perform t.ok('Save: change today''s match day before it starts, and the end date', e is null, e);
  perform t.ok('Save: days follow the end date', (select days from public.events where id = v) = 64);
  e := t.err(format(s, v, current_date + 60, team0 || '{"5":"A"}', jsonb_build_object('1', past, '4', '[{"a":[1,2],"b":[3,4]}]'::jsonb)));
  perform t.ok('Save: take out a player with no matches played', e is null, e);
  perform t.done();

  perform t.act_as(2);
  e := t.err(format(s, v, current_date + 60, team0, jsonb_build_object('1', past)));
  perform t.ok('Refuse: someone who isn''t the organiser', e is not null, e);
  perform t.done();
  perform t.act_as(0);
  e := t.err(format(s, v, current_date + 60, team0 || '{"5":"A"}', jsonb_build_object('1', past, '4', '[{"a":[1,2],"b":[3,4]}]'::jsonb, '11', '[{"a":[5],"b":[4]}]'::jsonb)));
  perform t.ok('Save: an admin can change it too', e is null, e);
  perform t.done();

  -- entering a card on a season day
  insert into public.rounds (date, created_by, game, pairing, scores, done, submitted, lineup)
    values (current_date, 1, 'none', 0, (select jsonb_agg('[4,4,4]'::jsonb) from generate_series(1, 18)), (select jsonb_agg(false) from generate_series(1, 18)), '{}', '[{"m":1},{"m":3},{"m":5}]');
  perform t.act_as(1);
  e := t.err(format('select public.enter_event_round((select max(id) from public.rounds where created_by = 1), %s, ''{1,3}''::bigint[])', v));
  perform t.ok('Enter: players with a match today can count their card', e is null, e);
  e := t.err(format('select public.enter_event_round((select max(id) from public.rounds where created_by = 1), %s, ''{5}''::bigint[], ''{"m":1}''::jsonb)', v));
  perform t.ok('Enter: a player with no match today can''t', e like '%no match%', e);
  perform t.done();
  -- once a counted card has a hole saved, today is locked
  update public.rounds set done = jsonb_set(done, '{0}', 'true') where id = (select max(id) from public.rounds where created_by = 1);
  perform t.act_as(1);
  e := t.err(format(s, v, current_date + 60, team0 || '{"5":"A"}', jsonb_build_object('1', past, '4', today, '11', '[{"a":[5],"b":[4]}]'::jsonb)));
  perform t.ok('Refuse: changing today''s match day once it has started', e like '%has started%', e);
  perform t.done();
end $$;

select test, ok, detail from t.results order by n;
rollback;
