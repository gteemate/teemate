-- Database tests: knockouts members set up themselves (organiser picks the players). Rolled back.
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

insert into public.members (id, name) values (991601, 'MK Organiser'), (991602, 'MK Two'), (991603, 'MK Three'), (991604, 'MK Four'), (991605, 'MK Five'), (991606, 'MK Outsider');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'mk-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 6) i;
update public.members m set user_id = (select id from auth.users where email = 'mk-test-' || (m.id - 991600) || '@example.invalid') where m.id between 991601 and 991606;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;


do $$ declare e text; c bigint; m public.ko_matches; begin
  perform t.act_as(991601);
  c := public.create_member_knockout('Friday Knockout', 'singles', '[[991601],[991602],[991603],[991604],[991605]]'::jsonb, array[current_date + 14, current_date + 28, current_date + 42]);
  perform t.set('ko', c);
  perform t.ok('Made, drawn and published in one go: 5 players, a bracket of 8 with 3 byes',
    (select draw_published and created_by = 991601 and not open from public.signup_comps where id = c)
    and (select count(*) from public.ko_matches where comp_id = c) = 7 and (select count(*) from public.ko_matches where comp_id = c and status = 'bye') = 3
    and (select round_deadlines[3] from public.signup_comps where id = c) = current_date + 42);
  e := t.err('select public.create_member_knockout(''Pairs KO'', ''pairs'', ''[[991601],[991602,991603]]''::jsonb, null)');
  perform t.ok('Pairs need two players each', e like '%pair%', e);
  e := t.err('select public.create_member_knockout(''Twice'', ''singles'', ''[[991602],[991602]]''::jsonb, null)');
  perform t.ok('Nobody twice', e like '%twice%', e);
  e := t.err('select public.create_member_knockout(''Alone'', ''singles'', ''[[991602]]''::jsonb, null)');
  perform t.ok('At least two', e like '%two%', e);
  reset role;

  perform t.act_as(991602);
  perform t.ok('Players in it see it, and the draw', exists (select 1 from public.signup_comps where id = t.id('ko')) and exists (select 1 from public.ko_matches where comp_id = t.id('ko')));
  select * into m from public.ko_matches where comp_id = t.id('ko') and status = 'open' order by round, slot limit 1;
  e := t.err(format('select public.admin_set_ko_result(%s, %s, ''3&2'')', m.id, m.a_entry));
  perform t.ok('A player can''t set results (only the organiser)', e is not null, e);
  reset role;

  perform t.act_as(991606);
  perform t.ok('Someone not in it doesn''t see it', not exists (select 1 from public.signup_comps where id = t.id('ko')));
  reset role;

  perform t.act_as(991601);
  perform public.admin_set_ko_result(m.id, m.b_entry, 'walkover');
  perform t.ok('The organiser sets results', (select status = 'confirmed' and winner_entry = m.b_entry from public.ko_matches where id = m.id));
  perform public.delete_member_knockout(t.id('ko'));
  perform t.ok('…and can delete their own knockout', not exists (select 1 from public.signup_comps where id = t.id('ko')));
  reset role;
end $$;

select test, ok, detail from t.results order by n;
rollback;
