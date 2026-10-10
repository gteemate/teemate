-- Database tests: who marks a card counted for a league or competition (entries.marker). Rolled back.
begin;
create schema t;
create table t.results (n serial, test text, ok boolean, detail text);
create table t.ids (k text primary key, id bigint);
grant usage on schema t to anon, authenticated;
grant all on all tables in schema t to anon, authenticated;
grant all on all sequences in schema t to anon, authenticated;
create function t.ok(p_test text, p_ok boolean, p_detail text default null) returns void language sql as $$
  insert into t.results (test, ok, detail) values (p_test, coalesce(p_ok, false), p_detail) $$;
create function t.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return null; exception when others then return sqlerrm; end $$;
create function t.id(p_k text) returns bigint language sql as $$ select id from t.ids where k = p_k $$;
grant execute on all functions in schema t to anon, authenticated;

insert into public.members (id, name) values (991001, 'Mark One'), (991002, 'Mark Two'), (991003, 'Mark Off');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'mk-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 3) i;
update public.members m set user_id = (select id from auth.users where email = 'mk-test-' || (m.id - 991000) || '@example.invalid') where m.id between 991001 and 991003;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;


with g as (insert into public.guest_visits (member_id, date, guest_name, course_id, points) values (991001, current_date, 'Visiting Marker', 1, 0) returning id)
insert into t.ids select 'guest', id from g;
with e as (insert into public.events (name, start_date, style, fmt, club, everyone, created_by, weeks, best_of, league_teams, players, team)
  values ('Marker League', current_date, 'league', 'beststab', true, false, 991001, 4, 2, '[{"name":"Blues"},{"name":"Reds"}]', '{991001,991002}', '{"991001":0,"991002":1}') returning id)
insert into t.ids select 'league', id from e;
with e as (insert into public.events (name, start_date, days, style, fmt, players, created_by, entry_required)
  values ('Marker Cup', current_date, 1, 'individual', 'stab', '{991001,991002}', 991001, true) returning id)
insert into t.ids select 'cup', id from e;
with r as (insert into public.rounds (created_by, lineup, scores, done, game) values
  (991001, jsonb_build_array(jsonb_build_object('m', 991001), jsonb_build_object('m', 991002), jsonb_build_object('g', (select id from t.ids where k = 'guest'))), '[]', (select jsonb_agg(false) from generate_series(1, 18)), 'stab') returning id)
insert into t.ids select 'card', id from r;

do $$ declare e text; begin
  perform t.act_as(991001);
  perform public.enter_league(t.id('card'), t.id('league'), '{991001}', jsonb_build_object('m', 991002));
  perform t.ok('League: marked by another member on the card', (select marker = jsonb_build_object('m', 991002) from public.league_entries where member_id = 991001 and event_id = t.id('league')));
  perform public.enter_event_round(t.id('card'), t.id('cup'), '{991002}', jsonb_build_object('g', t.id('guest')));
  perform t.ok('Competition: a guest can mark', (select marker = jsonb_build_object('g', t.id('guest')) from public.event_entries where member_id = 991002 and event_id = t.id('cup')));
  e := t.err(format('select public.enter_event_round(%s, %s, ''{991001}'', %L)', t.id('card'), t.id('cup'), jsonb_build_object('m', 991003)));
  perform t.ok('A marker who isn''t on the card is refused', e like '%marker%', e);
  e := t.err(format('select public.enter_event_round(%s, %s, ''{991001}'', %L)', t.id('card'), t.id('cup'), jsonb_build_object('m', 991001)));
  perform t.ok('You can''t mark your own card', e like '%marker%', e);
  perform public.enter_event_round(t.id('card'), t.id('cup'), '{991001}');
  perform t.ok('No marker still works (an older app)', exists (select 1 from public.event_entries where member_id = 991001 and event_id = t.id('cup') and marker is null));
  reset role;
end $$;

select test, ok, detail from t.results order by n;
rollback;
