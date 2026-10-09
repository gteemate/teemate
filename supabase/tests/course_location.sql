-- Database tests: the course location (for the weather on Home). Rolled back.
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

insert into public.members (id, name) values (990701, 'Weather Admin'), (990702, 'Weather Member');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'wx-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 2) i;
update public.members m set user_id = (select id from auth.users where email = 'wx-test-' || (m.id - 990700) || '@example.invalid'), admin = (m.id = 990701) where m.id between 990701 and 990702;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;


do $$ declare e text; begin
  perform t.act_as(990701);
  perform public.admin_set_course_location(55.2, -6.65, 'Portrush, Northern Ireland');
  perform t.ok('Admin sets the course location', public.get_theme()->>'coursePlace' = 'Portrush, Northern Ireland'
    and (public.get_theme()->>'courseLat')::float = 55.2, public.get_theme()::text);
  e := t.err('select public.admin_set_course_location(91, 0, ''Nowhere'')');
  perform t.ok('A location that isn''t on the map is refused', e like '%location%', e);
  reset role;

  perform t.act_as(990702);
  e := t.err('select public.admin_set_course_location(1, 1, ''x'')');
  perform t.ok('Members can''t set it', e like '%Only admins%', e);
  reset role;

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  perform t.ok('Visitors (before sign-in) see it with the club colours', (public.get_theme()->>'courseLat') is not null);
  reset role;
end $$;

select test, ok, detail from t.results order by n;
rollback;
