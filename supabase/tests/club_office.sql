-- Database tests: the club office login. Rolled back.
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

-- Start from no office (the live club may have one already).
update public.members set office = false where office;
insert into public.members (id, name, email) values (990801, 'Office Admin', 'office-adm@example.invalid'), (990802, 'Office Member', 'office-mem@example.invalid');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'office-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 3) i;
update public.members m set user_id = (select id from auth.users where email = 'office-' || (m.id - 990800) || '@example.invalid'), admin = (m.id = 990801) where m.id between 990801 and 990802;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;

do $$ declare e text; v bigint; v2 bigint; begin
  perform t.act_as(990801);
  v := public.admin_set_office_login('Office-3@example.invalid');
  reset role;
  perform t.ok('An admin makes the office login: an admin, marked office, linked to the login that already exists',
    (select office and admin and name = 'Club office' and email = 'office-3@example.invalid'
       and user_id = (select id from auth.users where email = 'office-3@example.invalid') from public.members where id = v));

  perform t.act_as(990801);
  perform t.ok('Members & access says which row is the office',
    (select (x->>'office')::boolean from jsonb_array_elements(public.admin_list_members()) x where (x->>'id')::bigint = v));
  e := t.err('select public.admin_set_office_login(''office-mem@example.invalid'')');
  perform t.ok('A member''s email can''t be the office''s', e like '%office needs its own%', e);
  v2 := public.admin_set_office_login('new-office@example.invalid');
  reset role;
  perform t.ok('A new email changes the same office, and its old login goes', v2 = v
    and not exists (select 1 from auth.users where email = 'office-3@example.invalid')
    and (select count(*) from public.members where office) = 1);

  e := t.err(format('update public.members set admin = false where id = %s', v));
  perform t.ok('The office is always an admin', e like '%members_office_is_admin%', e);

  perform t.act_as(990802);
  e := t.err('select public.admin_set_office_login(''x@example.invalid'')');
  perform t.ok('Members can''t set it', e like '%Only admins%', e);
  reset role;

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  e := t.err('select public.admin_set_office_login(''x@example.invalid'')');
  perform t.ok('Visitors can''t call it', e like '%permission denied%', e);
  reset role;
end $$;

select test, ok, detail from t.results order by n;
rollback;
