-- Database tests: removing an answered tee time request from your own list. Rolled back.
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
create function t.set(p_k text, p_id bigint) returns void language sql as $$ insert into t.ids values (p_k, p_id) on conflict (k) do update set id = excluded.id $$;
create function t.id(p_k text) returns bigint language sql as $$ select id from t.ids where k = p_k $$;
grant execute on all functions in schema t to anon, authenticated;

insert into public.members (id, name) values (991301, 'Req Admin'), (991302, 'Req Member'), (991303, 'Req Other');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'rqd-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 3) i;
update public.members m set user_id = (select id from auth.users where email = 'rqd-test-' || (m.id - 991300) || '@example.invalid'), admin = (m.id = 991301) where m.id between 991301 and 991303;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;


with s as (insert into public.tee_slots (course_id, date, start_time) values (1, current_date + 60, 7), (1, current_date + 60, 17) returning id, start_time)
insert into t.ids select case start_time when 7 then 'a' else 'b' end, id from s;
insert into public.tee_time_requests (member_id, slot_id, member_ids, guests, reason, status) values (991302, (select id from t.ids where k = 'a'), '{}', '[]', 'Answered', 'declined'), (991302, (select id from t.ids where k = 'b'), '{}', '[]', 'Waiting', 'pending');
do $$ begin
  perform t.set('answered', (select id from public.tee_time_requests where reason = 'Answered' and member_id = 991302));
  perform t.set('waiting', (select id from public.tee_time_requests where reason = 'Waiting' and member_id = 991302));
end $$;

do $$ declare e text; begin
  perform t.act_as(991303);
  e := t.err(format('select public.dismiss_tee_time_request(%s)', t.id('answered')));
  perform t.ok('Only your own requests', e is not null, e);
  reset role;
  perform t.act_as(991302);
  e := t.err(format('select public.dismiss_tee_time_request(%s)', t.id('waiting')));
  perform t.ok('A waiting request is cancelled, not removed', e like '%waiting%', e);
  perform public.dismiss_tee_time_request(t.id('answered'));
  perform t.ok('Removed from my list', (select dismissed from public.tee_time_requests where id = t.id('answered')));
  reset role;
  perform t.act_as(991301);
  perform t.ok('Admins still see it', exists (select 1 from public.tee_time_requests where id = t.id('answered')));
  reset role;
end $$;

select test, ok, detail from t.results order by n;
rollback;
