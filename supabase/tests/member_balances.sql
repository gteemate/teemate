-- Database tests: members' balances. Rolled back.
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

insert into public.members (id, name) values (991301, 'Bal A'), (991302, 'Bal B');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'bal-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 2) i;
update public.members m set user_id = (select id from auth.users where email = 'bal-' || (m.id - 991300) || '@example.invalid') where m.id between 991301 and 991302;
insert into public.member_balances (member_id, competition_pence, clubhouse_pence) values (991301, 4250, 1210), (991302, 100, 0);

do $$ declare e text; begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = 991301), 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform t.ok('A member reads their own balances (the columns the app asks for)',
    (select competition_pence = 4250 and clubhouse_pence = 1210 and source = 'example' from public.member_balances where member_id = 991301));
  perform t.ok('…and nobody else''s', (select count(*) from public.member_balances) = 1);
  e := t.err('update public.member_balances set competition_pence = 999999');
  perform t.ok('…and can''t change them', e like '%permission denied%', e);
  reset role;

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  e := t.err('select * from public.member_balances');
  perform t.ok('Visitors can''t read balances', e like '%permission denied%', e);
  reset role;
end $$;

select test, ok, detail from t.results order by n;
rollback;
