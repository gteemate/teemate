-- Database tests: one card per group for a tee time (start_tee_time_card). Rolled back.
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

-- Four test members of their own (not on the live list) and a tee time today for them.
insert into public.members (id, name) select 990000 + i, 'Card Test ' || i from generate_series(1, 4) i;
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'card-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 4) i;
update public.members m set user_id = (select id from auth.users where email = 'card-test-' || (m.id - 990000) || '@example.invalid') where m.id between 990001 and 990004;
create table t.slot (id bigint);
with s as (insert into public.tee_slots (course_id, date, start_time) values (1, current_date, 5) returning id) insert into t.slot select id from s;
grant select on t.slot to anon, authenticated;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;

-- A fresh card as a phone would send it, me first.
create function t.card(p_me bigint) returns jsonb language sql as $$
  select jsonb_build_object('slot_id', (select id from t.slot), 'game', 'stab', 'pairing', 0, 'submitted', '{}'::jsonb,
    'lineup', (select jsonb_agg(jsonb_build_object('m', m) order by m <> p_me, m) from generate_series(990001, 990003) m),
    'scores', (select jsonb_agg('[4,4,4]'::jsonb) from generate_series(1, 18)), 'done', (select jsonb_agg(false) from generate_series(1, 18))) $$;
grant execute on function t.card(bigint) to anon, authenticated;

do $$ declare a jsonb; b jsonb; c jsonb; e text; begin
  perform t.act_as(990001);
  a := public.start_tee_time_card(t.card(990001));
  perform t.ok('Start card: the first phone creates the card', not (a->>'joined')::boolean and (select created_by from public.rounds where id = (a->>'id')::bigint) = 990001, a::text);
  reset role;

  perform t.act_as(990002);
  b := public.start_tee_time_card(t.card(990002));
  perform t.ok('Start card: a second phone in the group gets the same card', (b->>'joined')::boolean and b->>'id' = a->>'id', b::text);
  perform t.ok('Start card: still one card for the tee time', (select count(*) from public.rounds where slot_id = (select id from t.slot)) = 1);
  reset role;

  update public.rounds set submitted = '{"stab": true}' where id = (a->>'id')::bigint; -- they finish the round
  perform t.act_as(990002);
  c := public.start_tee_time_card(t.card(990002));
  perform t.ok('Start card: a finished card isn''t joined (a new round starts)', not (c->>'joined')::boolean and c->>'id' <> a->>'id', c::text);
  reset role;

  perform t.act_as(990004); -- not on the card
  e := t.err($q$select public.start_tee_time_card(t.card(990004) || '{"lineup":[{"m":990004}]}')$q$);
  perform t.ok('Start card: someone not on the group''s card gets their own, not theirs',
    e is null and (select count(*) from public.rounds where slot_id = (select id from t.slot) and lineup @> '[{"m":990004}]') = 1, e);
  reset role;

  perform t.act_as(990001);
  e := t.err($q$select public.start_tee_time_card('{"game":"stab"}')$q$);
  perform t.ok('Start card: needs a tee time', e like '%tee time is needed%', e);
  reset role;

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  e := t.err($q$select public.start_tee_time_card(t.card(990001))$q$);
  perform t.ok('Start card: visitors can''t', e is not null, e);
  reset role;
end $$;

select test, ok, detail from t.results order by n;
rollback;
