-- Database tests: Find a time, confirming: my answers, my partner's (same as mine) and an 'anything else' note,
-- saved together. Rolled back.
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

do $$ declare r jsonb; e text; d date := public.club_today(); t1 bigint; t2 bigint; begin
  perform t.act_as(999001);
  perform public.suggest_match_times(999301, jsonb_build_array(jsonb_build_object('day', d + 2, 'part', 'morning'), jsonb_build_object('day', d + 3, 'part', 'evening')));
  reset role;
  t1 := (select id from public.match_times where ko_match_id = 999301 and day = d + 2);
  t2 := (select id from public.match_times where ko_match_id = 999301 and day = d + 3);

  -- Aidan confirms: can do the first, not the second; Aoibhinn the same; with a note.
  perform t.act_as(999003);
  r := public.confirm_match_times(999301, jsonb_build_object(t1::text, true, t2::text, false), jsonb_build_object(t1::text, true, t2::text, false), '  any weekday after 5pm  ');
  reset role;
  perform t.ok('Confirm: my answers are saved',
    (select can from public.match_time_answers where time_id = t1 and member_id = 999003) and not (select can from public.match_time_answers where time_id = t2 and member_id = 999003), r::text);
  perform t.ok('Confirm: the same for my partner, marked as answered by me',
    (select can and answered_by = 999003 from public.match_time_answers where time_id = t1 and member_id = 999004)
    and not (select can from public.match_time_answers where time_id = t2 and member_id = 999004));
  perform t.act_as(999001); r := public.get_match_times(999301); reset role;
  perform t.ok('Confirm: the note is kept (trimmed) and shown to the match',
    r->'notes'->>'999003' = 'any weekday after 5pm' and (r->'answeredBy'->>'999004')::bigint = 999003, r::text);

  -- Orla confirms the first: everyone can, so everyone is told
  perform t.act_as(999002); r := public.confirm_match_times(999301, jsonb_build_object(t1::text, true), null, null); reset role;
  perform t.ok('Confirm: the last one in makes it agreed and everyone is told',
    (r->>'agreed')::bigint = t1 and (select count(distinct member_id) from public.booking_notices where kind = 'agreed' and ko_match_id = 999301) = 4, r::text);

  -- only my own partner, never the other side
  perform t.act_as(999001);
  e := t.err(format('select public.confirm_match_times(999301, %L, %L, null)', jsonb_build_object(t1::text, true), jsonb_build_object(t1::text, false)));
  r := public.get_match_times(999301);
  reset role;
  perform t.ok('Confirm: my partner is my own (Pat answers for Orla, not for the other side)',
    e is null and (select can from public.match_time_answers where time_id = t1 and member_id = 999002) = false, coalesce(e, 'ok'));
  perform t.act_as(999005);
  e := t.err(format('select public.confirm_match_times(999301, %L, null, null)', jsonb_build_object(t1::text, true)));
  reset role;
  perform t.ok('Confirm: only the players', e = 'Only the players in this match can arrange it.', e);
  perform t.act_as(999003);
  e := t.err(format('select public.confirm_match_times(999301, %L, null, %L)', jsonb_build_object(t1::text, true), repeat('x', 121)));
  reset role;
  perform t.ok('Confirm: a note is up to 120 characters', e = 'Keep the note to 120 characters.', e);
  perform t.act_as(999003); perform public.confirm_match_times(999301, '{}', null, ''); r := public.get_match_times(999301); reset role;
  perform t.ok('Confirm: an empty note clears it', not (r->'notes' ? '999003'), (r->'notes')::text);
end $$;

select test, ok, detail from t.results order by n;
rollback;
