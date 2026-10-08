-- Database tests: admins granting and removing access, and the sign-up check.
-- Everything runs in one transaction that is rolled back, so real data is untouched.
begin;

create schema t;
create table t.results (n serial, test text, ok boolean, detail text);
create table t.users (member_id bigint primary key, uid uuid not null);
grant usage on schema t to anon, authenticated;
grant all on all tables in schema t to anon, authenticated;
grant all on all sequences in schema t to anon, authenticated;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
declare v uuid := (select uid from t.users where member_id = p_member);
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function t.done() returns void language plpgsql as $$ begin reset role; end $$;
create function t.ok(p_test text, p_ok boolean, p_detail text default null) returns void language sql as $$
  insert into t.results (test, ok, detail) values (p_test, coalesce(p_ok, false), p_detail) $$;
create function t.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return null; exception when others then return sqlerrm; end $$;
-- What Supabase Auth would get back from the hook when someone asks for a link.
create function t.hook(p_email text) returns jsonb language sql as $$
  select public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', p_email))) $$;
grant execute on all functions in schema t to anon, authenticated;

-- Test logins: member 0 as an admin, member 1 as committee but not admin.
insert into auth.users (id, email, aud, role)
  select gen_random_uuid(), 'access-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(0, 1) i;
insert into t.users select i, (select id from auth.users where email = 'access-test-' || i || '@example.invalid') from generate_series(0, 1) i;
update public.members m set user_id = u.uid, email = 'access-test-' || m.id || '@example.invalid' from t.users u where m.id = u.member_id;
update public.members set admin = (id = 0), committee = id in (0, 1) where id in (0, 1);

-- ------------------------------------------------------------------ non-admins
do $$ begin
  perform t.act_as(1);
  perform t.ok('Committee (not admin): cannot list emails', t.err('select public.admin_list_members()') is not null);
  perform t.ok('Committee (not admin): cannot grant access', t.err($q$select public.admin_save_member(null, 'Sneaky', 'sneaky@example.invalid')$q$) is not null);
  perform t.ok('Committee (not admin): cannot make themselves admin', t.err($q$select public.admin_save_member(1, 'Declan Murphy', 'access-test-1@example.invalid', null, 8.2, true, true)$q$) is not null);
  perform t.ok('Member: still cannot read emails directly', t.err('select email from public.members') is not null);
  perform t.done();
end $$;

-- ------------------------------------------------------------------ admin grants access
do $$ declare v_id bigint; v_list jsonb; e text; begin
  perform t.act_as(0);
  v_list := public.admin_list_members();
  perform t.ok('Admin: sees everyone with emails', jsonb_array_length(v_list) = (select count(*) from public.members)
                                                 and exists (select 1 from jsonb_array_elements(v_list) x where x->>'email' = 'access-test-1@example.invalid'));
  v_id := public.admin_save_member(null, 'New Golfer', '  New.Golfer@Example.invalid ', '12345678', 18.4);
  perform t.done(); -- check the stored row as the database owner (admins read emails only via admin_list_members)
  perform t.ok('Admin: adds a member (email stored lower-case)', (select email from public.members where id = v_id) = 'new.golfer@example.invalid');
  perform t.ok('Admin: new member is not committee or admin by default', (select not committee and not admin from public.members where id = v_id));
  perform t.act_as(0);
  e := t.err($q$select public.admin_save_member(null, 'Twin', 'NEW.GOLFER@example.invalid')$q$);
  perform t.ok('Admin: the same email twice is refused', e like '%already has that email%', e);
  e := t.err($q$select public.admin_save_member(null, 'Bad', 'not-an-email')$q$);
  perform t.ok('Admin: a bad email is refused', e like '%look like an email%', e);
  e := t.err($q$select public.admin_save_member(0, 'Gary', 'access-test-0@example.invalid', null, 12.4, true, false)$q$);
  perform t.ok('Admin: cannot remove own admin rights', e like '%own admin%', e);
  e := t.err($q$select public.admin_save_member(0, 'Gary', '', null, 12.4, true, true)$q$);
  perform t.ok('Admin: cannot remove own access', e like '%own admin%', e);
  perform public.admin_save_member(1, 'Declan Murphy', 'access-test-1@example.invalid', null, 8.2, true, true);
  perform t.ok('Admin: can make another member an admin', (select admin from public.members where id = 1));
  perform t.done();
end $$;

-- ------------------------------------------------------------------ the sign-up check
select t.ok('Sign-up: an added email is allowed', t.hook('new.golfer@example.invalid') = '{}'::jsonb);
select t.ok('Sign-up: email case doesn''t matter', t.hook('New.Golfer@EXAMPLE.invalid') = '{}'::jsonb);
select t.ok('Sign-up: an unknown email is refused with 403', (t.hook('stranger@example.invalid')->'error'->>'http_code') = '403',
  t.hook('stranger@example.invalid')::text);
select t.ok('Sign-up: only Supabase Auth can call the check',
  not has_function_privilege('authenticated', 'public.hook_before_user_created(jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.hook_before_user_created(jsonb)', 'execute')
  and has_function_privilege('supabase_auth_admin', 'public.hook_before_user_created(jsonb)', 'execute'));

-- When the added member signs in, their login is linked.
insert into auth.users (id, email, aud, role) values (gen_random_uuid(), 'new.golfer@example.invalid', 'authenticated', 'authenticated');
select t.ok('Sign-in: added member''s login is linked',
  (select user_id from public.members where email = 'new.golfer@example.invalid') = (select id from auth.users where email = 'new.golfer@example.invalid'));

-- ------------------------------------------------------------------ admin removes access
do $$ declare v_id bigint := (select id from public.members where email = 'new.golfer@example.invalid'); begin
  perform t.act_as(0);
  perform public.admin_save_member(v_id, 'New Golfer', '', '12345678', 18.4);
  perform t.done();
  perform t.ok('Remove access: member kept, email cleared', (select email is null and user_id is null from public.members where id = v_id));
  perform t.ok('Remove access: their login is deleted', not exists (select 1 from auth.users where email = 'new.golfer@example.invalid'));
  perform t.ok('Remove access: they can''t get a new link', t.hook('new.golfer@example.invalid') ? 'error');
end $$;

-- Changing someone's email moves access to the new address.
do $$ begin
  perform t.act_as(0);
  perform public.admin_save_member(1, 'Declan Murphy', 'declan.new@example.invalid', null, 8.2, true, true);
  perform t.done();
  perform t.ok('Change email: old login removed', not exists (select 1 from auth.users where email = 'access-test-1@example.invalid'));
  perform t.ok('Change email: new address allowed, old refused',
    t.hook('declan.new@example.invalid') = '{}'::jsonb and t.hook('access-test-1@example.invalid') ? 'error');
end $$;

select test, ok, detail from t.results order by n;
rollback;
