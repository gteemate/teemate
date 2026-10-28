-- Database tests: the club office resets Find a time for a knockout (a demo).
-- Rolled back.
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

insert into public.members (id, name) values (999001, 'Pat Reid'), (999002, 'Orla Ryan'), (999003, 'Aidan Kavanagh'), (999004, 'Aoibhinn Kavanagh'), (999005, 'Sam Doyle');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'ft-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 5) i;
update public.members m set user_id = (select id from auth.users where email = 'ft-' || (m.id - 999000) || '@example.invalid') where m.id between 999001 and 999005;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;

-- A pairs knockout: Pat & Orla v Aidan & Aoibhinn, round 1 to be played by 14 days from now.
insert into public.signup_comps (id, name, category, kind, closes_on, created_by, draw_published, round_deadlines) values
  (999101, 'Mixed fourball', 'open', 'pairs', public.club_today() - 3, null, true, array[public.club_today() + 14, public.club_today() + 28]);
insert into public.signup_entries (id, comp_id, member_id, partner_id) values (999201, 999101, 999001, 999002), (999202, 999101, 999003, 999004);
insert into public.ko_matches (id, comp_id, round, slot, a_entry, b_entry, status) values (999301, 999101, 1, 0, 999201, 999202, 'open');

update public.members set admin = true where id = 999005;

do $$ declare d date := public.club_today(); e text; r jsonb; begin
  perform t.act_as(999001);
  perform public.suggest_match_times(999301, jsonb_build_array(jsonb_build_object('day', d + 2, 'part', 'evening'), jsonb_build_object('day', d + 3, 'part', 'evening')));
  perform public.confirm_match_times(999301, '{}', null, 'after 5pm');
  reset role;
  insert into public.match_time_answers (time_id, member_id, can) select id, m, true from public.match_times, unnest(array[999002, 999003, 999004]::bigint[]) m where ko_match_id = 999301;
  insert into public.booking_notices (member_id, kind, date, old_time, ko_match_id) values (999003, 'times', d + 2, 0, 999301);

  perform t.act_as(999003);
  e := t.err('select public.demo_reset_find_a_time(999101)');
  reset role;
  perform t.ok('Reset Find a time: only the club office', e = 'Only the club office can reset Find a time.', e);

  perform t.act_as(999005);
  r := public.demo_reset_find_a_time(999101);
  reset role;
  perform t.ok('Reset Find a time: the days, ticks, notes and notices go',
    (r->>'removed')::int = 2
    and not exists (select 1 from public.match_times where ko_match_id = 999301)
    and not exists (select 1 from public.match_time_notes where ko_match_id = 999301)
    and not exists (select 1 from public.booking_notices where ko_match_id = 999301), r::text);
  perform t.ok('Reset Find a time: the match itself stays', exists (select 1 from public.ko_matches where id = 999301 and status = 'open'));
end $$;

select test, ok, detail from t.results order by n;
rollback;
