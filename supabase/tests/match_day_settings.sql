-- Database tests: match day settings — 3-balls, holes per day, points, Stableford total. Rolled back.
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

insert into public.members (id, name, hcp_index) select i, 'MDS ' || i, 10 from generate_series(1, 6) i on conflict (id) do nothing;
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'mds-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 6) i;
update public.members m set user_id = (select id from auth.users where email = 'mds-test-' || m.id || '@example.invalid') where m.id between 1 and 6;
update public.members set admin = false, office = false where id between 1 and 6;
create table t.ev (id bigint);
grant all on t.ev to authenticated;
with e as (insert into public.events (name, start_date, days, season, style, fmt, players, team, matches, entry_required, created_by, points)
  values ('MDS Season', current_date - 3, 120, true, 'ryder', 'bbl', '{1,2,3,4,5,6}', '{"1":"A","2":"A","3":"A","4":"B","5":"B","6":"B"}',
          '{"1":[{"a":[1,2],"b":[4,5]}]}', true, 1, '{"four":1,"singles":1,"threePair":1,"threeSingle":2}') returning id)
insert into t.ev select id from e;

do $$ declare v bigint := (select id from t.ev); e text;
  team0 jsonb := '{"1":"A","2":"A","3":"A","4":"B","5":"B","6":"B"}';
  past jsonb := '[{"a":[1,2],"b":[4,5]}]';
  s text := 'select public.save_season(%s, %L::date, %L::jsonb, %L::jsonb, %L::jsonb)';
begin
  e := t.err($q$insert into public.events (name, start_date, style, fmt) values ('Stab total', current_date + 3, 'ryder', 'stabtot')$q$);
  perform t.ok('A Stableford total event can be made', e is null, e);
  perform t.act_as(1);
  e := t.err(format(s, v, current_date + 100, team0, jsonb_build_object('1', past, '10', '[{"a":[1,2],"b":[4]},{"a":[3],"b":[5,6]}]'::jsonb), '{"10":{"holes":12,"points":{"four":2,"threeSingle":3}}}'));
  perform t.ok('Save: 3-balls both ways round, 12 holes, points for the day', e is null, e);
  perform t.ok('Save: the day''s rules are kept', (select day_rules->'10'->>'holes' from public.events where id = v) = '12');
  e := t.err(format(s, v, current_date + 100, team0, jsonb_build_object('1', past, '10', '[{"a":[1,2,3],"b":[4]}]'::jsonb), null));
  perform t.ok('Refuse: 3 v 1', e is not null, e);
  e := t.err(format(s, v, current_date + 100, team0, jsonb_build_object('1', past), '{"10":{"holes":11}}'));
  perform t.ok('Refuse: 11 holes', e like '%hole%', e);
  e := t.err(format(s, v, current_date + 100, team0, jsonb_build_object('1', past), '{"10":{"points":{"four":15}}}'));
  perform t.ok('Refuse: 15 points', e like '%points%', e);
  e := t.err(format(s, v, current_date + 100, team0, jsonb_build_object('1', past), '{"10":{"points":{"four":0.3}}}'));
  perform t.ok('Refuse: 0.3 points', e like '%points%', e);
  e := t.err(format(s, v, current_date + 100, team0, jsonb_build_object('1', past), '{"1":{"holes":9}}'));
  perform t.ok('Refuse: changing a played day''s holes', e like '%has started%', e);
  e := t.err(format(s, v, current_date + 100, team0, jsonb_build_object('1', past), '{"10":{"points":{"four":"2"}}}'));
  perform t.ok('Refuse (friendly): points as text', e like 'Match points%', e);
  e := t.err(format(s, v, current_date + 100, team0, jsonb_build_object('1', past), '{"10":{"points":{"fourball":2}}}'));
  perform t.ok('Refuse: a points name that isn''t a match type', e like 'Match points%', e);
  e := t.err(format(s, v, current_date + 100, team0, jsonb_build_object('1', past), '{"x":{"holes":9}}'));
  perform t.ok('Refuse: a day that isn''t a day number', e like '%match day%', e);
  e := t.err(format(s, v, current_date + 100, team0, jsonb_build_object('1', past), '{"500":{"holes":9}}'));
  perform t.ok('Refuse: a day after the end of the season', e like '%match day%', e);
  perform t.done();
  -- Every save is checked, not just save_season (one-offs, seasons before they start, admins).
  e := t.err(format($q$update public.events set points = '{"four":"2"}' where id = %s$q$, v));
  perform t.ok('Check: an event''s points are numbers', e is not null, e);
  e := t.err(format($q$update public.events set day_rules = '{"3":{"holes":11}}' where id = %s$q$, v));
  perform t.ok('Check: an event''s day holes are from the list', e is not null, e);
  e := t.err($q$insert into public.events (name, start_date, days, style, fmt, points, day_rules) values ('Ok one-off', current_date + 3, 2, 'ryder', 'bbl', '{"four":1.5}', '{"2":{"holes":12,"points":{"singles":2}}}')$q$);
  perform t.ok('Check: good points and day settings save', e is null, e);
end $$;

select test, ok, detail from t.results order by n;
rollback;
