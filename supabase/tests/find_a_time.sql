-- Database tests: Find a time. The players in a knockout match suggest days (morning, afternoon or evening) and tick
-- which they can do; when everyone can, they're all told. Rolled back.
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

do $$ declare r jsonb; e text; d date := public.club_today(); v_t bigint; v_n int; begin
  perform t.act_as(999005);
  e := t.err(format($q$select public.suggest_match_times(999301, '[{"day":"%s","part":"morning"}]')$q$, d + 2));
  reset role;
  perform t.ok('Find a time: only the players can suggest', e = 'Only the players in this match can arrange it.', e);

  perform t.act_as(999001);
  e := t.err(format($q$select public.suggest_match_times(999301, '[{"day":"%s","part":"morning"}]')$q$, d + 20));
  reset role;
  perform t.ok('Find a time: days within the round', e = 'Pick days up to the play-by date.', e);

  perform t.act_as(999001);
  perform public.suggest_match_times(999301, jsonb_build_array(
    jsonb_build_object('day', d + 2, 'part', 'morning'), jsonb_build_object('day', d + 2, 'part', 'evening'), jsonb_build_object('day', d + 5, 'part', 'afternoon')));
  r := public.get_match_times(999301);
  reset role;
  perform t.ok('Find a time: the suggester counts as ✓',
    jsonb_array_length(r->'times') = 3 and (select bool_and((x->'answers'->>'999001')::boolean) from jsonb_array_elements(r->'times') x)
    and jsonb_array_length(r->'players') = 4, r::text);
  perform t.ok('Find a time: the others are told',
    (select count(distinct member_id) from public.booking_notices where kind = 'times' and member_id in (999002, 999003, 999004)) = 3
    and not exists (select 1 from public.booking_notices where kind = 'times' and member_id = 999001));

  perform t.act_as(999001);
  e := t.err(format($q$select public.suggest_match_times(999301, '[{"day":"%s","part":"morning"}]')$q$, d + 2));
  reset role;
  perform t.ok('Find a time: no duplicates', e = 'That day is already suggested.', e);

  perform t.act_as(999003); -- 3 so far; 6 more makes 9, then 4 more would be 13
  perform public.suggest_match_times(999301, (select jsonb_agg(jsonb_build_object('day', d + 6 + i, 'part', 'morning')) from generate_series(0, 5) i));
  e := t.err(format('select public.suggest_match_times(999301, %L)',
    (select jsonb_agg(jsonb_build_object('day', d + 6 + i, 'part', 'evening')) from generate_series(0, 3) i)));
  reset role;
  perform t.ok('Find a time: at most 12', e = 'A match can have at most 12 suggestions on the go.', e);

  -- Orla, Aidan and Aoibhinn answer the first one; the last ✓ makes it agreed.
  v_t := (select id from public.match_times where ko_match_id = 999301 and day = d + 2 and part = 'morning');
  perform t.act_as(999002); perform public.answer_match_time(v_t, true); reset role;
  perform t.act_as(999003); perform public.answer_match_time(v_t, true); reset role;
  perform t.act_as(999001); r := public.get_match_times(999301); reset role;
  perform t.ok('Find a time: 3 of 4 isn''t agreed', r->'agreed' = 'null'::jsonb and not exists (select 1 from public.booking_notices where kind = 'agreed'), r::text);
  perform t.act_as(999004); perform public.answer_match_time(v_t, true); r := public.get_match_times(999301); reset role;
  perform t.ok('Find a time: the last ✓ makes it agreed and everyone is told',
    (r->>'agreed')::bigint = v_t and (select count(distinct member_id) from public.booking_notices where kind = 'agreed' and member_id between 999001 and 999004) = 4, r::text);

  perform t.act_as(999005);
  e := t.err('select public.get_match_times(999301)');
  v_n := (select count(*) from public.match_times);
  reset role;
  perform t.ok('Find a time: members see only their own matches', e = 'Only the players in this match can arrange it.' and v_n = 0, coalesce(e, '') || ' ' || v_n);

  update public.ko_matches set status = 'confirmed', winner_entry = 999201, result = '2&1' where id = 999301;
  perform t.ok('Find a time: a result clears the suggestions', not exists (select 1 from public.match_times where ko_match_id = 999301));
  perform t.act_as(999001);
  e := t.err(format($q$select public.suggest_match_times(999301, '[{"day":"%s","part":"morning"}]')$q$, d + 3));
  reset role;
  perform t.ok('Find a time: not once it''s been played', e = 'That match has been played.', e);
end $$;

select test, ok, detail from t.results order by n;
rollback;
