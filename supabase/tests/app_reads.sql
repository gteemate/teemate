-- Database tests: what the app reads straight from tables works for a signed-in member (column-by-column grants
-- are easy to miss when a column is added). Keep in step with MEMBER_COLS in src/api/client.js. Rolled back.
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

insert into public.members (id, name) values (991001, 'Reads Member');
insert into auth.users (id, email, aud, role) values (gen_random_uuid(), 'reads-1@example.invalid', 'authenticated', 'authenticated');
update public.members set user_id = (select id from auth.users where email = 'reads-1@example.invalid') where id = 991001;

do $$ declare e text; begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = 991001), 'role', 'authenticated')::text, true);
  set local role authenticated;
  e := t.err('select id, name, gui, hcp_index, admin, hut_staff, plays_in, office from public.members where office = false');
  perform t.ok('Members can read every column the app asks for (MEMBER_COLS), and filter on office', e is null, e);
  e := t.err('select email from public.members');
  perform t.ok('…but not anyone''s email', e like '%permission denied%', e);
  e := t.err('select id, kind, date, old_time, new_time, note, created_at from public.booking_notices where seen = false');
  perform t.ok('Members can read their booking notices', e is null, e);
  reset role;
end $$;

select test, ok, detail from t.results order by n;
rollback;
