-- Database tests: the leaderboard of the day — weekly days and today's switch (admins only). Rolled back.
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
grant execute on all functions in schema t to anon, authenticated;

insert into public.members (id, name, hcp_index) values (0, 'Gary', 12.4) on conflict (id) do nothing;
insert into public.members (id, name, hcp_index) values (1, 'Declan', 8.2) on conflict (id) do nothing;
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'db-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(0, 1) i;
update public.members m set user_id = (select id from auth.users where email = 'db-test-' || m.id || '@example.invalid') where m.id between 0 and 1;
update public.members set admin = (id = 0), office = false where id between 0 and 1;

do $$ declare e text; th jsonb; begin
  th := public.get_theme();
  perform t.ok('Every day to start', th->'dayBoardDays' = '[0,1,2,3,4,5,6]'::jsonb, th::text);
  perform t.act_as(1);
  e := t.err('select public.admin_set_day_board_days(''{1,2,3}'')');
  perform t.ok('A member can''t change the days', e is not null, e);
  e := t.err('select public.admin_set_day_board_today(false)');
  perform t.ok('A member can''t switch today', e is not null, e);
  execute 'reset role';
  perform t.act_as(0);
  perform public.admin_set_day_board_days('{0,1,2,3,4,5}'); -- off on Saturdays
  perform t.ok('An admin sets the days', public.get_theme()->'dayBoardDays' = '[0,1,2,3,4,5]'::jsonb);
  e := t.err('select public.admin_set_day_board_days(''{1,9}'')');
  perform t.ok('Days are 0 (Sunday) to 6 (Saturday)', e like '%days%', e);
  perform public.admin_set_day_board_today(true);
  perform t.ok('An admin switches today on', public.get_theme()->'dayBoardToday' = jsonb_build_object('date', current_date, 'on', true), (public.get_theme()->'dayBoardToday')::text);
  perform public.admin_set_day_board_today(null);
  perform t.ok('…and back to the weekly setting', public.get_theme()->'dayBoardToday' = 'null'::jsonb);
  execute 'reset role';
end $$;

select test, ok, detail from t.results order by n;
rollback;
