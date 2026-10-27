-- Database tests: open holes (events, days, league weeks, knockout rounds) and club event templates. Rolled back.
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
insert into public.members (id, name) values (990401, 'Holes Admin'), (990402, 'Holes Member'), (990403, 'Holes Organiser');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'holes-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 3) i;
update public.members m set user_id = (select id from auth.users where email = 'holes-test-' || (m.id - 990400) || '@example.invalid'), admin = (m.id = 990401)
 where m.id between 990401 and 990403;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;


with e as (insert into public.events (name, start_date, style, fmt, club, everyone, created_by) values
  ('Holes Cup', current_date + 5, 'individual', 'stab', true, true, 990401) returning id)
insert into t.ev select 'cup', id from e;
with c as (insert into public.signup_comps (name, category, kind, open, created_by) values ('Holes KO', 'open', 'singles', false, 990403) returning id)
insert into t.ev select 'ko', id from c;

do $$ declare e text; begin
  perform t.ok('holes_problem: all 18 (null)', public.holes_problem(null) is null);
  perform t.ok('holes_problem: an older match day number', public.holes_problem('12') is null);
  perform t.ok('holes_problem: a list', public.holes_problem('[1,2,10]') is null);
  perform t.ok('holes_problem: empty refused', public.holes_problem('[]') = 'Pick at least one hole, from 1 to 18.');
  perform t.ok('holes_problem: hole 0 refused', public.holes_problem('[0]') is not null);
  perform t.ok('holes_problem: hole 19 refused', public.holes_problem('[19]') is not null);
  perform t.ok('holes_problem: a repeat refused', public.holes_problem('[1,1]') is not null);
  perform t.ok('holes_problem: a number not on the old list refused', public.holes_problem('7') is not null);

  e := t.err(format('update public.events set holes = %L where id = %s', '[]', t.id('cup')));
  perform t.ok('Event: no holes refused', e like '%Pick at least one hole%', e);
  update public.events set holes = '[1,2,3,4,5,6,10,11,12]', days = 2, day_rules = '{"2": {"holes": [1,2,3]}}' where id = t.id('cup');
  perform t.ok('Event: its holes and a day''s own holes save', (select holes = '[1,2,3,4,5,6,10,11,12]' and day_rules->'2'->'holes' = '[1,2,3]' from public.events where id = t.id('cup')));
  e := t.err(format('update public.events set day_rules = %L where id = %s', '{"2": {"holes": [20]}}', t.id('cup')));
  perform t.ok('Event: a day''s bad holes refused', e like '%Pick at least one hole%', e);
  e := t.err(format('update public.events set day_rules = %L where id = %s', '{"3": {"holes": [1]}}', t.id('cup')));
  perform t.ok('Event: a day not in the event refused', e like '%aren''t for a match day%', e);
end $$;

with e as (insert into public.events (name, start_date, style, fmt, club, everyone, created_by, weeks, best_of, day_rules) values
  ('Holes League', current_date + 5, 'league', 'beststab', true, true, 990401, 6, 4, '{"5": {"holes": [10,11,12,13,14,15,16,17,18]}}') returning id)
insert into t.ev select 'league', id from e;

do $$ declare e text; begin
  perform t.ok('League: a week''s own holes save (weeks, not days)', (select day_rules->'5' is not null from public.events where id = t.id('league')));

  perform t.act_as(990402);
  e := t.err(format('select public.set_ko_round_holes(%s, 1, %L)', t.id('ko'), '[1,2,3]'));
  perform t.ok('Knockout holes: refused for a member who isn''t its organiser', e like '%organiser%', e);
  e := t.err('insert into public.event_templates (name, setup) values (''Sneaky'', ''{}'')');
  perform t.ok('Templates: a member can''t make one', e is not null, e);
  perform t.ok('Templates: a member sees none', not exists (select 1 from public.event_templates));
  reset role;

  perform t.act_as(990403);
  perform public.set_ko_round_holes(t.id('ko'), 1, '[1,2,3,4,5,6,7,8,9]');
  perform t.ok('Knockout holes: the organiser sets a round''s', (select round_holes->'1' = '[1,2,3,4,5,6,7,8,9]' from public.signup_comps where id = t.id('ko')));
  e := t.err(format('select public.set_ko_round_holes(%s, 2, %L)', t.id('ko'), '[]'));
  perform t.ok('Knockout holes: none refused', e like '%Pick at least one hole%', e);
  e := t.err('select public.set_ko_round_holes(-12345, 1, ''[1,2,3]'')');
  perform t.ok('Knockout holes: a knockout that doesn''t exist is refused, not ignored', e like '%no longer exists%', e);
  e := t.err(format('select public.set_ko_round_holes(%s, 11, %L)', t.id('ko'), '[1,2,3]'));
  perform t.ok('Knockout holes: a round beyond the draw is refused', e like '%isn''t a round%', e);
  perform public.set_ko_round_holes(t.id('ko'), 1, null);
  perform t.ok('Knockout holes: cleared back to all 18', (select round_holes is null from public.signup_comps where id = t.id('ko')));
  reset role;

  perform t.act_as(990401);
  insert into public.event_templates (name, setup) values ('Turkey Trot', '{"style": "individual", "holes": [1,2,3]}');
  perform t.ok('Templates: an admin makes and sees one', exists (select 1 from public.event_templates where name = 'Turkey Trot'));
  delete from public.event_templates where name = 'Turkey Trot';
  perform t.ok('Templates: an admin deletes one', not exists (select 1 from public.event_templates where name = 'Turkey Trot'));
  reset role;
end $$;

select test, ok, detail from t.results order by n;
rollback;
