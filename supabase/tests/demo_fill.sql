-- Database tests: demo entries. The office fills a sign-up competition or event with demo players, and takes them out
-- again; real entries stay. Rolled back.
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
grant execute on all functions in schema t to anon, authenticated;

insert into public.members (id, name, admin, plays_in) values (998001, 'Office Tester', true, null), (998002, 'Pat Reid', false, 'men'), (998003, 'Orla Ryan', false, 'ladies');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'df-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 3) i;
update public.members m set user_id = (select id from auth.users where email = 'df-' || (m.id - 998000) || '@example.invalid') where m.id between 998001 and 998003;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;

insert into public.signup_comps (id, name, category, kind, closes_on, max_entries) values
  (998101, 'Mixed fourball', 'mixed', 'pairs', public.club_today() + 7, 16),
  (998102, 'Men’s match play', 'men', 'singles', public.club_today() + 7, null),
  (998103, 'Ladies foursomes', 'ladies', 'pairs', public.club_today() + 7, null);
insert into public.signup_entries (comp_id, member_id, partner_id) values (998101, 998002, 998003); -- a real pair
insert into public.events (id, name, start_date, style, fmt, club, everyone, weeks, best_of, signup, max_entries, players) values
  (998201, 'Winter league', public.club_today() + 7, 'league', 'beststab', true, false, 10, 4, true, 12, array[998002]::bigint[]);

do $$ declare r jsonb; e text; begin
  perform t.act_as(998002);
  e := t.err('select public.demo_fill_signup(998101, 8)');
  reset role;
  perform t.ok('Demo entries: only the office', e = 'Only the club office can add or remove demo entries.', e);

  perform t.act_as(998001);
  r := public.demo_fill_signup(998101, 8);
  reset role;
  perform t.ok('Demo entries: tops up to the number asked for, keeping real ones',
    (r->>'added')::int = 7 and (select count(*) from public.signup_entries where comp_id = 998101) = 8
    and exists (select 1 from public.signup_entries where comp_id = 998101 and member_id = 998002), r::text);
  perform t.ok('Demo entries: a mixed pair is one man and one lady, all demo',
    not exists (select 1 from public.signup_entries s join public.members a on a.id = s.member_id join public.members b on b.id = s.partner_id
                 where s.comp_id = 998101 and s.member_id <> 998002 and not (a.demo and b.demo and a.plays_in = 'men' and b.plays_in = 'ladies')));

  perform t.act_as(998001);
  r := public.demo_fill_signup(998101, null);
  reset role;
  perform t.ok('Demo entries: to the limit', (select count(*) from public.signup_entries where comp_id = 998101) = 16, r::text);
  perform t.act_as(998001);
  r := public.demo_fill_signup(998101, 32);
  reset role;
  perform t.ok('Demo entries: never over the limit', (r->>'added')::int = 0 and (select count(*) from public.signup_entries where comp_id = 998101) = 16, r::text);

  perform t.act_as(998001);
  perform public.demo_fill_signup(998102, 10);
  perform public.demo_fill_signup(998103, 6);
  reset role;
  perform t.ok('Demo entries: men’s singles get men; ladies’ pairs get two ladies, nobody twice',
    (select count(*) from public.signup_entries s join public.members m on m.id = s.member_id where s.comp_id = 998102 and m.plays_in = 'men' and m.demo) = 10
    and (select count(*) from public.signup_entries s join public.members a on a.id = s.member_id join public.members b on b.id = s.partner_id
          where s.comp_id = 998103 and a.plays_in = 'ladies' and b.plays_in = 'ladies' and a.id <> b.id) = 6
    and (select count(distinct x) from public.signup_entries s, unnest(array[s.member_id, s.partner_id]) x where s.comp_id = 998103) = 12);

  perform t.act_as(998001);
  e := t.err('select public.demo_fill_signup(998102, 0)');
  reset role;
  perform t.ok('Demo entries: a number is needed', e = 'Pick how many entries.', e);

  perform t.act_as(998001);
  r := public.demo_clear_signup(998101);
  reset role;
  perform t.ok('Demo entries: Remove takes out only the demo ones',
    (r->>'removed')::int = 15 and (select array_agg(member_id) from public.signup_entries where comp_id = 998101) = array[998002]::bigint[], r::text);

  insert into public.ko_matches (comp_id, round, slot, a_entry, status) select 998102, 1, 0, min(id), 'open' from public.signup_entries where comp_id = 998102;
  perform t.act_as(998001);
  e := t.err('select public.demo_clear_signup(998102)');
  reset role;
  perform t.ok('Demo entries: not once the draw is made', e = 'The draw has been made, so the entries can''t change.', e);

  perform t.act_as(998001);
  r := public.demo_fill_event(998201, 50);
  reset role;
  perform t.ok('Demo entries: a sign-up league fills to its places',
    (r->>'added')::int = 11 and (select cardinality(players) from public.events where id = 998201) = 12 and (select 998002 = any (players) from public.events where id = 998201), r::text);
  update public.events set captain_pool = players[2:3] where id = 998201;
  perform t.act_as(998001);
  r := public.demo_clear_event(998201);
  reset role;
  perform t.ok('Demo entries: Remove takes demo players off the league and its captains',
    (r->>'removed')::int = 11 and (select players = array[998002]::bigint[] and cardinality(captain_pool) = 0 from public.events where id = 998201), r::text);
end $$;

select test, ok, detail from t.results order by n;
rollback;
