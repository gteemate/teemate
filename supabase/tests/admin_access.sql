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

-- Member 0 (these tests' admin) was a sample member and isn't on the live list any more: add one, rolled back with the rest.
insert into public.members (id, name, hcp_index) values (0, 'Gary', 12.4) on conflict (id) do nothing;
-- Test logins: member 0 as an admin, member 1 as an ordinary member.
insert into auth.users (id, email, aud, role)
  select gen_random_uuid(), 'access-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(0, 1) i;
insert into t.users select i, (select id from auth.users where email = 'access-test-' || i || '@example.invalid') from generate_series(0, 1) i;
update public.members m set user_id = u.uid, email = 'access-test-' || m.id || '@example.invalid' from t.users u where m.id = u.member_id;
update public.members set admin = (id = 0) where id in (0, 1);

-- ------------------------------------------------------------------ non-admins
do $$ begin
  perform t.act_as(1);
  perform t.ok('Member (not admin): cannot list emails', t.err('select public.admin_list_members()') is not null);
  perform t.ok('Member (not admin): cannot grant access', t.err($q$select public.admin_save_member(null, 'Sneaky', 'sneaky@example.invalid')$q$) is not null);
  perform t.ok('Member (not admin): cannot make themselves admin', t.err($q$select public.admin_save_member(1, 'Declan Murphy', 'access-test-1@example.invalid', null, 8.2, true)$q$) is not null);
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
  perform t.ok('Admin: new member is not an admin by default', (select not admin from public.members where id = v_id));
  perform t.act_as(0);
  e := t.err($q$select public.admin_save_member(null, 'Twin', 'NEW.GOLFER@example.invalid')$q$);
  perform t.ok('Admin: the same email twice is refused', e like '%already has that email%', e);
  e := t.err($q$select public.admin_save_member(null, 'Bad', 'not-an-email')$q$);
  perform t.ok('Admin: a bad email is refused', e like '%look like an email%', e);
  e := t.err($q$select public.admin_save_member(0, 'Gary', 'access-test-0@example.invalid', null, 12.4, false)$q$);
  perform t.ok('Admin: cannot remove own admin rights', e like '%own admin%', e);
  e := t.err($q$select public.admin_save_member(0, 'Gary', '', null, 12.4, true)$q$);
  perform t.ok('Admin: cannot remove own access', e like '%own admin%', e);
  perform public.admin_save_member(1, 'Declan Murphy', 'access-test-1@example.invalid', null, 8.2, true);
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
  perform public.admin_save_member(1, 'Declan Murphy', 'declan.new@example.invalid', null, 8.2, true);
  perform t.done();
  perform t.ok('Change email: old login removed', not exists (select 1 from auth.users where email = 'access-test-1@example.invalid'));
  perform t.ok('Change email: new address allowed, old refused',
    t.hook('declan.new@example.invalid') = '{}'::jsonb and t.hook('access-test-1@example.invalid') ? 'error');
end $$;

-- ------------------------------------------------------------------ reset login (forgotten password)
insert into public.members (name, email) values ('Reset Me', 'reset.me@example.invalid');
insert into auth.users (id, email, aud, role) values (gen_random_uuid(), 'reset.me@example.invalid', 'authenticated', 'authenticated');
do $$ declare v_id bigint := (select id from public.members where email = 'reset.me@example.invalid'); e text; begin
  update public.members set admin = false where id = 1; -- Declan was made admin above
  perform t.act_as(1);
  e := t.err(format('select public.admin_reset_login(%s)', v_id));
  perform t.ok('Reset login: non-admins cannot', e is not null, e);
  perform t.done();
  perform t.act_as(0);
  perform public.admin_reset_login(v_id);
  e := t.err('select public.admin_reset_login(0)');
  perform t.ok('Reset login: admin cannot reset their own', e like '%own login%', e);
  perform t.done();
  perform t.ok('Reset login: login deleted', not exists (select 1 from auth.users where email = 'reset.me@example.invalid'));
  perform t.ok('Reset login: email stays approved', (select email from public.members where id = v_id) = 'reset.me@example.invalid'
                                                  and t.hook('reset.me@example.invalid') = '{}'::jsonb);
end $$;
insert into auth.users (id, email, aud, role) values (gen_random_uuid(), 'reset.me@example.invalid', 'authenticated', 'authenticated');
select t.ok('Reset login: new account re-links to the same member',
  (select user_id from public.members where email = 'reset.me@example.invalid') = (select id from auth.users where email = 'reset.me@example.invalid'));

-- ------------------------------------------------------------------ access requests
do $$ declare e text; begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  e := t.err($q$select public.request_access('Pete.Test@Example.invalid', 'Pete Test')$q$);
  perform t.ok('Request: anyone (not signed in) can leave their name', e is null, e);
  e := t.err($q$select public.request_access('pete.test@example.invalid', 'Pete T')$q$);
  perform t.ok('Request: asking twice updates it, no duplicate', e is null, e);
  e := t.err($q$select public.request_access('pete.test@example.invalid', '  ')$q$);
  perform t.ok('Request: a name is required', e like '%your name%', e);
  e := t.err($q$select public.request_access('access-test-0@example.invalid', 'Already In')$q$);
  perform t.ok('Request: an approved email is told to create the account', e like '%already approved%', e);
  perform t.ok('Request: visitors cannot read requests', t.err('select count(*) from public.access_requests') is not null);
  reset role;
  perform t.ok('Request: stored once, lower-case, latest name', (select count(*) = 1 and min(name) = 'Pete T' from public.access_requests where email = 'pete.test@example.invalid'));

  perform t.act_as(1); -- ordinary member
  perform t.ok('Request: members cannot see requests', (select count(*) from public.access_requests) = 0);
  e := t.err(format('select public.admin_decline_request(%s)', (select 1)));
  perform t.ok('Request: members cannot decline', e is not null, e);
  perform t.done();

  perform t.act_as(0); -- admin
  perform t.ok('Request: admin sees the name', (select name from public.access_requests where email = 'pete.test@example.invalid') = 'Pete T');
  perform public.admin_save_member(null, 'Pete Test', 'pete.test@example.invalid');
  perform t.ok('Request: approving clears the request', not exists (select 1 from public.access_requests where email = 'pete.test@example.invalid'));
  perform t.done();
  perform t.ok('Request: approved email can now create an account', t.hook('pete.test@example.invalid') = '{}'::jsonb);

  perform public.request_access('decline.me@example.invalid', 'Decline Me');
  perform t.act_as(0);
  perform public.admin_decline_request((select id from public.access_requests where email = 'decline.me@example.invalid'));
  perform t.done();
  perform t.ok('Request: decline removes it and grants nothing', not exists (select 1 from public.access_requests where email = 'decline.me@example.invalid')
                                                                and t.hook('decline.me@example.invalid') ? 'error');
end $$;

-- ------------------------------------------------------------------ request access with a password (set once)
do $$ declare e text; v_req bigint; v_uid uuid; begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  perform public.request_access('once.only@example.invalid', 'Once Only');
  reset role;
  perform t.ok('Request: with a pending request, sign-up is allowed (password set now)', t.hook('once.only@example.invalid') = '{}'::jsonb);
  insert into auth.users (id, email, aud, role) values (gen_random_uuid(), 'once.only@example.invalid', 'authenticated', 'authenticated') returning id into v_uid;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'email', 'once.only@example.invalid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform t.ok('Request: while waiting they see nothing', (select count(*) from public.members) = 0);
  perform t.ok('Request: they can tell they are waiting', public.my_request_pending());
  reset role;
  perform t.act_as(0);
  perform public.admin_save_member(null, 'Once Only', 'once.only@example.invalid');
  perform t.done();
  perform t.ok('Request: approving links the account they already made (no second password)',
    (select user_id from public.members where email = 'once.only@example.invalid') = v_uid);

  -- decline removes the waiting account
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  perform public.request_access('say.no@example.invalid', 'Say No');
  reset role;
  insert into auth.users (id, email, aud, role) values (gen_random_uuid(), 'say.no@example.invalid', 'authenticated', 'authenticated');
  select id into v_req from public.access_requests where email = 'say.no@example.invalid';
  perform t.act_as(0);
  perform public.admin_decline_request(v_req);
  perform t.done();
  perform t.ok('Request: declining deletes the waiting account', not exists (select 1 from auth.users where email = 'say.no@example.invalid'));
end $$;

-- ------------------------------------------------------------------ favourites
do $$ declare e text; begin
  perform t.act_as(0);
  perform t.ok('Favourites: can star a member', t.err('insert into public.member_favourites values (0, 2)') is null);
  perform t.ok('Favourites: cannot add to someone else''s', t.err('insert into public.member_favourites values (1, 2)') is not null);
  perform t.done();
  perform t.act_as(1);
  perform t.ok('Favourites: others cannot see mine', (select count(*) from public.member_favourites where member_id = 0) = 0);
  perform t.done();
end $$;

-- ------------------------------------------------------------------ deleting members
insert into public.members (name, email) values ('Delete Me', 'delete.me@example.invalid');
insert into auth.users (id, email, aud, role) values (gen_random_uuid(), 'delete.me@example.invalid', 'authenticated', 'authenticated');
do $$ declare v bigint := (select id from public.members where email = 'delete.me@example.invalid'); e text; begin
  update public.members set admin = false where id = 1;
  perform t.act_as(1);
  e := t.err(format('select public.admin_delete_member(%s)', v));
  perform t.ok('Delete: non-admins cannot', e like '%Only admins%', e);
  perform t.done();
  perform t.act_as(0);
  e := t.err('select public.admin_delete_member(0)');
  perform t.ok('Delete: an admin cannot delete themselves', e like '%delete yourself%', e);
  perform public.admin_delete_member(v);
  perform t.done();
  perform t.ok('Delete: member and their login are gone',
    not exists (select 1 from public.members where id = v) and not exists (select 1 from auth.users where email = 'delete.me@example.invalid'));
  perform t.ok('Delete: they can no longer sign up', t.hook('delete.me@example.invalid') ? 'error');
end $$;

select test, ok, detail from t.results order by n;
rollback;
