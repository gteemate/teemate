-- Database tests: the club office merges a member’s guests, or marks them as different people. Rolled back.
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


insert into public.members (id, name, admin) values (996001, 'Office Tester', true), (996002, 'Pat Reid', false);
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'gm-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 2) i;
update public.members m set user_id = (select id from auth.users where email = 'gm-' || (m.id - 996000) || '@example.invalid') where m.id between 996001 and 996002;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;

insert into public.guest_visits (member_id, date, guest_name, guest_club, course_id, points) values
  (996002, public.club_today() - 3, 'Gary Cochrane', 'Ballymena', 1, 1), (996002, public.club_today() - 5, 'Gary  Cochrane', 'Ballymena', 1, 1),
  (996002, public.club_today() - 9, 'G Cochrane', null, 1, 1), (996002, public.club_today() - 12, 'g cochrane', null, 1, 1);

do $$ declare e text; n int; begin
  perform t.act_as(996002);
  e := t.err('select public.office_merge_guests(996002, ''G Cochrane'', ''Gary Cochrane'')');
  reset role;
  perform t.ok('Guest merge: only the club office', e = 'Only the club office can merge guests.', e);

  perform t.act_as(996001);
  n := public.office_merge_guests(996002, 'G Cochrane', 'Gary Cochrane');
  reset role;
  perform t.ok('Guest merge: this year''s visits under the name kept (any case or spacing)',
    n = 2 and (select count(*) from public.guest_visits where member_id = 996002 and public.tidy_guest_name(guest_name) = 'gary cochrane') = 4, n::text);

  perform t.act_as(996001);
  e := t.err('select public.office_merge_guests(996002, ''G Cochrane'', ''Gary Cochrane'')');
  reset role;
  perform t.ok('Guest merge: nothing left under that name says so', e = 'There are no visits under that name this year.', e);

  perform t.act_as(996001);
  perform public.office_guests_not_same(996002, 'Steve Thompson', 'S  Thompson');
  perform public.office_guests_not_same(996002, 's thompson', 'Steve Thompson'); -- again, either way round: once
  reset role;
  perform t.ok('Different people: kept once, tidied, either way round',
    (select count(*) from public.guest_not_same where member_id = 996002) = 1
    and exists (select 1 from public.guest_not_same where member_id = 996002 and a = 's thompson' and b = 'steve thompson'));

  perform t.act_as(996002);
  e := t.err('select public.office_guests_not_same(996002, ''A B'', ''C D'')');
  n := (select count(*) from public.guest_not_same);
  reset role;
  perform t.ok('Different people: only the club office, and members can''t read them', e = 'Only the club office can do that.' and n = 0, e);
end $$;

select test, ok, detail from t.results order by n;
rollback;
