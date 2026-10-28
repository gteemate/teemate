-- Database tests: Find a time: one "everyone can do" notice per player listing every agreed slot.
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

do $$ declare d date := public.club_today(); t1 bigint; t2 bigint; t3 bigint; t4 bigint; all3 jsonb; p bigint; begin
  perform t.act_as(999001);
  perform public.suggest_match_times(999301, jsonb_build_array(jsonb_build_object('day', d + 2, 'part', 'evening'),
    jsonb_build_object('day', d + 3, 'part', 'evening'), jsonb_build_object('day', d + 5, 'part', 'morning')));
  reset role;
  t1 := (select id from public.match_times where ko_match_id = 999301 and day = d + 2);
  t2 := (select id from public.match_times where ko_match_id = 999301 and day = d + 3);
  t3 := (select id from public.match_times where ko_match_id = 999301 and day = d + 5);
  all3 := jsonb_build_object(t1::text, true, t2::text, true, t3::text, true);

  -- Everyone can do all three: one notice each, listing the three in order, dated the last day.
  foreach p in array array[999001, 999003]::bigint[] loop
    perform t.act_as(p); perform public.confirm_match_times(999301, all3, all3, null); reset role;
  end loop;
  perform t.ok('One notice: three agreed slots, one notice each',
    (select count(*) from public.booking_notices where kind = 'agreed' and ko_match_id = 999301) = 4
    and (select count(distinct member_id) from public.booking_notices where kind = 'agreed' and ko_match_id = 999301) = 4,
    (select count(*)::text from public.booking_notices where kind = 'agreed' and ko_match_id = 999301));
  perform t.ok('One notice: it lists every agreed slot, dated the last',
    (select bool_and(slots = jsonb_build_array(jsonb_build_object('day', d + 2, 'part', 'evening'), jsonb_build_object('day', d + 3, 'part', 'evening'),
       jsonb_build_object('day', d + 5, 'part', 'morning')) and date = d + 5) from public.booking_notices where kind = 'agreed' and ko_match_id = 999301),
    (select string_agg(slots::text, ' | ') from public.booking_notices where kind = 'agreed' and ko_match_id = 999301));

  -- Pat sees his; confirming again changes nothing for anyone.
  update public.booking_notices set seen = true where kind = 'agreed' and ko_match_id = 999301 and member_id = 999001;
  perform t.act_as(999003); perform public.confirm_match_times(999301, all3, null, null); reset role;
  perform t.ok('One notice: nothing new, no new notice',
    (select count(*) from public.booking_notices where kind = 'agreed' and ko_match_id = 999301) = 4);

  -- Aidan can't do the second after all: the unseen notices now list two; Pat (seen all three) gets nothing.
  perform t.act_as(999003); perform public.confirm_match_times(999301, jsonb_build_object(t2::text, false), null, null); reset role;
  perform t.ok('One notice: a slot drops out, unseen notices list what is left',
    (select bool_and(jsonb_array_length(slots) = 2) from public.booking_notices where kind = 'agreed' and ko_match_id = 999301 and not seen)
    and (select count(*) from public.booking_notices where kind = 'agreed' and ko_match_id = 999301 and not seen) = 3);
  perform t.ok('One notice: nothing new for a player who has seen them',
    not exists (select 1 from public.booking_notices where kind = 'agreed' and ko_match_id = 999301 and member_id = 999001 and not seen));

  -- A new day everyone can do: Pat is told again, with every agreed slot.
  perform t.act_as(999001);
  perform public.suggest_match_times(999301, jsonb_build_array(jsonb_build_object('day', d + 6, 'part', 'afternoon')));
  reset role;
  t4 := (select id from public.match_times where ko_match_id = 999301 and day = d + 6);
  foreach p in array array[999001, 999003]::bigint[] loop
    perform t.act_as(p); perform public.confirm_match_times(999301, jsonb_build_object(t4::text, true), jsonb_build_object(t4::text, true), null); reset role;
  end loop;
  perform t.ok('One notice: a newly agreed slot tells everyone again, listing all',
    (select count(*) from public.booking_notices where kind = 'agreed' and ko_match_id = 999301 and not seen) = 4
    and (select bool_and(jsonb_array_length(slots) = 3 and date = d + 6) from public.booking_notices where kind = 'agreed' and ko_match_id = 999301 and not seen));

  -- Nothing agreed any more: the unseen notices go.
  perform t.act_as(999003); perform public.confirm_match_times(999301, jsonb_build_object(t1::text, false, t3::text, false, t4::text, false), null, null); reset role;
  perform t.ok('One notice: nothing agreed, the unseen notices go',
    not exists (select 1 from public.booking_notices where kind = 'agreed' and ko_match_id = 999301 and not seen));
end $$;

select test, ok, detail from t.results order by n;
rollback;
