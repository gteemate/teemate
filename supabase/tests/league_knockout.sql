-- Database tests: leagues with a knockout finish (members' leagues too; a seeded draw from the table). Rolled back.
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
create function t.set(p_k text, p_id bigint) returns void language sql as $$ insert into t.ids values (p_k, p_id) on conflict (k) do update set id = excluded.id $$;
create function t.id(p_k text) returns bigint language sql as $$ select id from t.ids where k = p_k $$;
grant execute on all functions in schema t to anon, authenticated;

insert into public.members (id, name) values (991701, 'LK Organiser'), (991702, 'LK Two'), (991703, 'LK Three'), (991704, 'LK Four'), (991705, 'LK Five'), (991706, 'LK Outsider');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'lk-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 6) i;
update public.members m set user_id = (select id from auth.users where email = 'lk-test-' || (m.id - 991700) || '@example.invalid') where m.id between 991701 and 991706;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;


do $$ declare e text; v bigint; c bigint; begin
  perform t.act_as(991701);
  insert into public.events (name, start_date, style, fmt, club, everyone, created_by, weeks, best_of, league_teams, players, team, league_pairs, ko_top, ko_finish)
  values ('Pals League', current_date - 70, 'league', 'beststab', false, false, 991701, 8, 4, '[]', '{991701,991702,991703,991704,991705}', '{}', null, 4, current_date + 60)
  returning id into v;
  perform t.set('league', v);
  perform t.ok('A member creates a league for their group (with a knockout finish)', (select ko_top = 4 from public.events where id = v));
  reset role;

  perform t.act_as(991702);
  e := t.err(format('select public.start_league_knockout(%s, ''[[991701],[991702],[991703],[991704]]''::jsonb, null)', v));
  perform t.ok('Only the organiser (or an admin) starts the knockout', e like '%organiser%', e);
  reset role;

  perform t.act_as(991701);
  c := public.start_league_knockout(v, '[[991703],[991701],[991705],[991702]]'::jsonb, array[current_date + 30, current_date + 60]);
  perform t.set('ko', c);
  reset role; -- check the draw as the database (members only see their own entries)
  -- Seeds in table order: 1 991703, 2 991701, 3 991705, 4 991702. Semi-finals: 1 v 4, 2 v 3.
  perform t.ok('Seeded from the table: 1st v 4th, 2nd v 3rd',
    exists (select 1 from public.ko_matches m join public.signup_entries a on a.id = m.a_entry join public.signup_entries b on b.id = m.b_entry
             where m.comp_id = c and m.round = 1 and a.member_id = 991703 and b.member_id = 991702)
    and exists (select 1 from public.ko_matches m join public.signup_entries a on a.id = m.a_entry join public.signup_entries b on b.id = m.b_entry
             where m.comp_id = c and m.round = 1 and a.member_id = 991701 and b.member_id = 991705)
    and (select ko_comp from public.events where id = v) = c);
  perform t.act_as(991701);
  e := t.err(format('select public.start_league_knockout(%s, ''[[991701],[991702]]''::jsonb, null)', v));
  perform t.ok('Only once', e like '%already%', e);
  reset role;

  perform t.act_as(991704); -- in the league, didn't qualify
  perform t.ok('League players who didn''t qualify can still follow the knockout', exists (select 1 from public.ko_matches where comp_id = t.id('ko')));
  reset role;
  perform t.act_as(991706);
  perform t.ok('Outsiders can''t see it', not exists (select 1 from public.ko_matches where comp_id = t.id('ko')));
  reset role;

  -- Six qualifiers in a bracket of 8: the top two seeds get byes.
  update public.events set ko_comp = null where id = v; -- (as the database: start another for this check)
  perform t.act_as(991701);
  c := public.start_league_knockout(v, '[[991701],[991702],[991703],[991704],[991705],[991706]]'::jsonb, null);
  reset role;
  perform t.ok('Byes go to the top seeds', (select count(*) from public.ko_matches m join public.signup_entries a on a.id = m.a_entry
      where m.comp_id = c and m.round = 1 and m.status = 'bye' and a.member_id in (991701, 991702)) = 2);
end $$;

select test, ok, detail from t.results order by n;
rollback;
