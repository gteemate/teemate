-- Database tests: the club office updates members' handicap indexes in one go (from a file it uploads). Rolled back.
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

insert into public.members (id, name, hcp_index) values (997001, 'Office Admin I', 10), (997002, 'Pat Reid', 14.2), (997003, 'Chris Lowe', 20.0);
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'hi-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 3) i;
update public.members m set user_id = (select id from auth.users where email = 'hi-' || (m.id - 997000) || '@example.invalid'), admin = (m.id = 997001) where m.id between 997001 and 997003;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;

do $$ declare r jsonb; e text; begin
  perform t.act_as(997003);
  e := t.err($q$select public.admin_set_handicaps('[{"id": 997002, "hcp": 1}]')$q$);
  reset role;
  perform t.ok('Handicaps: only the club office can update them', e = 'Only the club office can update handicaps.', e);

  perform t.act_as(997001);
  r := public.admin_set_handicaps('[{"id": 997002, "hcp": 13.8}, {"id": 997003, "hcp": -2.1}]');
  reset role;
  perform t.ok('Handicaps: updated in one go (a plus handicap too)',
    (r->>'updated')::int = 2 and (select hcp_index from public.members where id = 997002) = 13.8 and (select hcp_index from public.members where id = 997003) = -2.1, r::text);

  perform t.act_as(997001);
  e := t.err($q$select public.admin_set_handicaps('[{"id": 997002, "hcp": 12}, {"id": 997003, "hcp": 60}]')$q$);
  reset role;
  perform t.ok('Handicaps: one out of range refuses the lot, nothing changed',
    e = 'Handicap index must be between +10 and 54.' and (select hcp_index from public.members where id = 997002) = 13.8, e);

  perform t.act_as(997001);
  e := t.err($q$select public.admin_set_handicaps('[{"id": 123456789, "hcp": 12}]')$q$);
  reset role;
  perform t.ok('Handicaps: someone who isn''t a member is refused', e = 'One of those isn''t a member any more.', e);
  perform t.act_as(997001);
  e := t.err($q$select public.admin_set_handicaps('[{"id": 997002, "hcp": 9}, {"id": 997002, "hcp": 28}]')$q$);
  reset role;
  perform t.ok('Handicaps: a member listed twice refuses the lot', e = 'A member is listed twice.' and (select hcp_index from public.members where id = 997002) = 13.8, e);
end $$;

select test, ok, detail from t.results order by n;
rollback;
