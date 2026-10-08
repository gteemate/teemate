-- Database tests: club colours. Rolled back.
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

insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'colour-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(0, 1) i;
update public.members m set user_id = (select id from auth.users where email = 'colour-test-' || m.id || '@example.invalid') where m.id in (0, 1);
update public.members set admin = (id = 0) where id in (0, 1);
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;

do $$ declare e text; begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  perform t.ok('Colours: readable before signing in (sign-in screen)', (public.get_theme()->>'main') ~ '^#[0-9A-F]{6}$');
  e := t.err($q$select public.admin_set_theme('#000000', '#ffffff')$q$);
  perform t.ok('Colours: visitors cannot change them', e is not null, e);
  reset role;

  perform t.act_as(1);
  e := t.err($q$select public.admin_set_theme('#000000', '#ffffff')$q$);
  perform t.ok('Colours: members (not admin) cannot change them', e like '%Only admins%', e);
  reset role;

  perform t.act_as(0);
  perform public.admin_set_theme('#0b6e4f', '#c9a227');
  perform t.ok('Colours: admin can change them (stored upper-case)', public.get_theme() = '{"main":"#0B6E4F","accent":"#C9A227"}'::jsonb, public.get_theme()::text);
  e := t.err($q$select public.admin_set_theme('green', '#C9A227')$q$);
  perform t.ok('Colours: names or bad hex refused', e like '%6-digit hex%', e);
  e := t.err($q$select public.admin_set_theme('#0B6E4', '#C9A227')$q$);
  perform t.ok('Colours: short hex refused', e like '%6-digit hex%', e);
  reset role;
end $$;

select test, ok, detail from t.results order by n;
rollback;
