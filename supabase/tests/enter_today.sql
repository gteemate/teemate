-- Database tests: entering a club competition on the day, from the card you're starting. Rolled back.
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
create function t.id(p_k text) returns bigint language sql as $$ select id from t.ids where k = p_k $$;
grant execute on all functions in schema t to anon, authenticated;

insert into public.members (id, name) values (991201, 'Day Admin'), (991202, 'Day Player'), (991203, 'Day Partner');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'day-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 3) i;
update public.members m set user_id = (select id from auth.users where email = 'day-test-' || (m.id - 991200) || '@example.invalid'), admin = (m.id = 991201) where m.id between 991201 and 991203;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;


-- Club competitions: open for entry today; open but tomorrow; today but not open for entry; today with a draw.
with e as (insert into public.events (name, start_date, days, style, fmt, club, everyone, self_entry, entry_required, created_by, players, matches) values
  ('Saturday Medal', current_date, 1, 'individual', 'stab', true, true, true, true, 991201, '{}', '{}'),
  ('Sunday Medal', current_date + 1, 1, 'individual', 'stab', true, true, true, true, 991201, '{}', '{}'),
  ('Invite Medal', current_date, 1, 'individual', 'stab', true, true, false, true, 991201, '{}', '{}'),
  ('Drawn Cup', current_date, 1, 'ryder', 'bbl', true, true, true, true, 991201, '{}', '{"1":[{"a":[1,2],"b":[3,4]}]}') returning id, name)
insert into t.ids select name, id from e;
with r as (insert into public.rounds (created_by, lineup, scores, done, game) values
  (991202, '[{"m":991202},{"m":991203}]', '[]', (select jsonb_agg(false) from generate_series(1, 18)), 'stab') returning id)
insert into t.ids select 'card', id from r;

do $$ declare e text; begin
  perform t.act_as(991202);
  perform public.enter_event_today(t.id('card'), t.id('Saturday Medal'), jsonb_build_object('m', 991203));
  perform t.ok('On the day: entered, and this card counts (with the marker)',
    (select 991202 = any (players) from public.events where id = t.id('Saturday Medal'))
    and exists (select 1 from public.event_entries where event_id = t.id('Saturday Medal') and member_id = 991202 and round_id = t.id('card') and marker = jsonb_build_object('m', 991203)));
  e := t.err(format('select public.enter_event_today(%s, %s, %L)', t.id('card'), t.id('Sunday Medal'), jsonb_build_object('m', 991203)));
  perform t.ok('Not on today: refused', e like '%isn''t on today%', e);
  e := t.err(format('select public.enter_event_today(%s, %s, %L)', t.id('card'), t.id('Invite Medal'), jsonb_build_object('m', 991203)));
  perform t.ok('Not open for entry: refused', e like '%isn''t open for entry%', e);
  e := t.err(format('select public.enter_event_today(%s, %s, %L)', t.id('card'), t.id('Drawn Cup'), jsonb_build_object('m', 991203)));
  perform t.ok('A competition with a draw: refused', e like '%draw%', e);
  e := t.err(format('select public.enter_event_today(%s, %s, null)', t.id('card'), t.id('Saturday Medal')));
  perform t.ok('Needs a marker', e like '%marking your card%', e);
  reset role;
  perform t.ok('A refusal enters nobody', not exists (select 1 from public.events where id in (t.id('Sunday Medal'), t.id('Invite Medal'), t.id('Drawn Cup')) and 991202 = any (players)));
end $$;

select test, ok, detail from t.results order by n;
rollback;
