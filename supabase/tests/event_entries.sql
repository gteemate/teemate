-- Database tests: events count only the cards ticked for them (event_entries). Rolled back.
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

insert into public.members (id, name) values (990401, 'Tick One'), (990402, 'Tick Two'), (990403, 'Tick Three');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'tick-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 3) i;
update public.members m set user_id = (select id from auth.users where email = 'tick-test-' || (m.id - 990400) || '@example.invalid') where m.id between 990401 and 990403;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;

-- An event today (1 and 2 in it; 3 isn't), and two of 1's cards today, plus one already started on hole 1.
with e as (insert into public.events (name, start_date, days, style, fmt, players, created_by, entry_required)
  values ('Tick Cup', current_date, 2, 'individual', 'stab', '{990401,990402}', 990401, true) returning id) insert into t.ids select 'ev', id from e;
with r as (insert into public.rounds (created_by, lineup, scores, done, game) values
  (990401, '[{"m":990401},{"m":990402},{"m":990403}]', '[]', (select jsonb_agg(false) from generate_series(1, 18)), 'stab') returning id) insert into t.ids select 'card', id from r;
with r as (insert into public.rounds (created_by, lineup, scores, done, game) values
  (990401, '[{"m":990401}]', '[]', (select jsonb_agg(false) from generate_series(1, 18)), 'stab') returning id) insert into t.ids select 'card2', id from r;
with r as (insert into public.rounds (created_by, lineup, scores, done, game) values
  (990402, '[{"m":990402}]', '[]', '[true]'::jsonb || (select jsonb_agg(false) from generate_series(1, 17)), 'stab') returning id) insert into t.ids select 'started', id from r;

do $$ declare e text; d int; begin
  perform t.act_as(990401);
  d := public.enter_event_round(t.id('card'), t.id('ev'), '{990401,990402}');
  perform t.ok('Tick: this card counts for the event (day 1) for both players', d = 1 and (select count(*) from public.event_entries where event_id = t.id('ev') and round_id = t.id('card')) = 2, d::text);
  e := t.err(format('select public.enter_event_round(%s, %s, ''{990401}'')', t.id('card2'), t.id('ev')));
  perform t.ok('Tick: one card per player per event day', e like '%already counting another card%', e);
  e := t.err(format('select public.enter_event_round(%s, %s, ''{990403}'')', t.id('card'), t.id('ev')));
  perform t.ok('Tick: only players in the event', e like '%isn''t in this event%', e);
  perform public.leave_event_round(t.id('card'), t.id('ev'), '{990402}');
  perform t.ok('Untick: that player''s card no longer counts', (select count(*) from public.event_entries where event_id = t.id('ev')) = 1);
  reset role;

  perform t.act_as(990402);
  e := t.err(format('select public.enter_event_round(%s, %s, ''{990402}'')', t.id('started'), t.id('ev')));
  perform t.ok('Tick: not once hole 1 is saved', e like '%before the first hole is saved%', e);
  e := t.err(format('select public.enter_event_round(%s, %s, ''{990401}'')', t.id('card2'), t.id('ev')));
  perform t.ok('Tick: only from a card you''re on', e like '%card you''re on%', e);
  reset role;

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  e := t.err(format('select public.enter_event_round(%s, %s, ''{990401}'')', t.id('card'), t.id('ev')));
  perform t.ok('Visitors can''t tick', e is not null, e);
  reset role;
end $$;

-- Events that existed before this keep counting every card, so their results don't change.
select t.ok('Existing events count automatically (entry_required off)', not exists (select 1 from public.events where entry_required and id <> t.id('ev')));

select test, ok, detail from t.results order by n;
rollback;
