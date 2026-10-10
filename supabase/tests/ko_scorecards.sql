-- Database tests: a knockout fixture's scorecard link. Rolled back.
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
create table t.ids (k text primary key, id bigint);
create function t.id(p_k text) returns bigint language sql as $$ select id from t.ids where k = p_k $$;
grant execute on all functions in schema t to anon, authenticated;

insert into public.members (id, name) values (991101, 'KoCard A'), (991102, 'KoCard B'), (991103, 'KoCard C');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'kc-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 3) i;
update public.members m set user_id = (select id from auth.users where email = 'kc-' || (m.id - 991100) || '@example.invalid') where m.id between 991101 and 991103;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;

do $$ declare c bigint; ea bigint; eb bigint; ec bigint; m bigint; r bigint; r2 bigint; e text; begin
  insert into public.signup_comps (name, category, kind, closes_on, open, draw_published) values ('KoCard Cup', 'open', 'singles', current_date - 1, true, true) returning id into c;
  insert into public.signup_entries (comp_id, member_id) values (c, 991101) returning id into ea;
  insert into public.signup_entries (comp_id, member_id) values (c, 991102) returning id into eb;
  insert into public.signup_entries (comp_id, member_id) values (c, 991103) returning id into ec;
  insert into public.ko_matches (comp_id, round, slot, a_entry, b_entry, status) values (c, 1, 0, ea, eb, 'open') returning id into m;
  insert into public.rounds (created_by, lineup, game, scores, done) values (991101, '[{"m":991101},{"m":991102}]', 'kos', '[]', '[]') returning id into r;
  insert into public.rounds (created_by, lineup, game, scores, done) values (991103, '[{"m":991103}]', 'kos', '[]', '[]') returning id into r2;
  insert into t.ids values ('m', m), ('r', r), ('r2', r2);

  perform t.act_as(991101);
  perform public.ko_link_card(m, r);
  perform t.ok('A player links their card to their match', (select round_id from public.ko_matches where id = m) = r);
  e := t.err(format('select public.ko_link_card(%s, %s)', m, r2));
  perform t.ok('…but not a card they aren''t on', e like '%isn''t yours%', e);
  reset role;

  perform t.act_as(991103);
  e := t.err(format('select public.ko_link_card(%s, %s)', m, r2));
  perform t.ok('Someone in the competition but not in the match can''t', e like '%your own match%', e);
  reset role;

  perform t.act_as(991102);
  perform t.ok('The opponent sees the link (and can read the card)', (select round_id from public.ko_matches where id = m) = r
    and exists (select 1 from public.rounds where id = r));
  reset role;

  update public.ko_matches set status = 'confirmed', winner_entry = ea where id = m;
  perform t.act_as(991101);
  e := t.err(format('select public.ko_link_card(%s, %s)', m, r));
  perform t.ok('No relinking once there''s a result', e like '%already has a result%', e);
  reset role;

  delete from public.rounds where id = r;
  perform t.ok('Deleting the card clears the link, the match stays', (select round_id is null from public.ko_matches where id = m));

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  e := t.err(format('select public.ko_link_card(%s, %s)', m, r2));
  perform t.ok('Visitors can''t call it', e like '%permission denied%', e);
  reset role;
end $$;

select test, ok, detail from t.results order by n;
rollback;
