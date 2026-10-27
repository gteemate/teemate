-- Database tests: leagues and club events open for sign-up, with dates and places. Rolled back.
begin;
create schema t;
create table t.results (n serial, test text, ok boolean, detail text);
create table t.ev (k text primary key, id bigint);
grant usage on schema t to anon, authenticated;
grant all on all tables in schema t to anon, authenticated;
grant all on all sequences in schema t to anon, authenticated;
create function t.ok(p_test text, p_ok boolean, p_detail text default null) returns void language sql as $$
  insert into t.results (test, ok, detail) values (p_test, coalesce(p_ok, false), p_detail) $$;
create function t.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return null; exception when others then return sqlerrm; end $$;
create function t.id(p_k text) returns bigint language sql as $$ select id from t.ev where k = p_k $$;
grant execute on all functions in schema t to anon, authenticated;

-- Test members of their own: an admin and two members.
insert into public.members (id, name) values (990501, 'Signup Admin'), (990502, 'Signup Member'), (990503, 'Signup Other');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'signup-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 3) i;
update public.members m set user_id = (select id from auth.users where email = 'signup-test-' || (m.id - 990500) || '@example.invalid'), admin = (m.id = 990501)
 where m.id between 990501 and 990503;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;

insert into public.members (id, name) values (990504, 'Signup Fourth');
insert into auth.users (id, email, aud, role) values (gen_random_uuid(), 'signup-test-4@example.invalid', 'authenticated', 'authenticated');
update public.members set user_id = (select id from auth.users where email = 'signup-test-4@example.invalid') where id = 990504;

with e as (insert into public.events (name, start_date, style, fmt, club, everyone, created_by, weeks, best_of, signup, advertise_from, entries_close, max_entries)
  values ('Winter League', current_date + 30, 'league', 'beststab', true, false, 990501, 10, 4, true, current_date - 1, current_date + 20, 2),
         ('Later League', current_date + 30, 'league', 'beststab', true, false, 990501, 10, 4, true, current_date + 5, current_date + 20, 10),
         ('Closed League', current_date + 30, 'league', 'beststab', true, false, 990501, 10, 4, true, current_date - 9, current_date - 1, 10) returning id, name)
insert into t.ev select case name when 'Winter League' then 'open' when 'Later League' then 'later' else 'closed' end, id from e;

do $$ declare e text; begin
  e := t.err(format('update public.events set entries_close = start_date where id = %s', t.id('open')));
  perform t.ok('Set up: entries can''t close on or after the first day', e is not null, e);
  e := t.err(format('update public.events set max_entries = 0 where id = %s', t.id('open')));
  perform t.ok('Set up: places are at least 1', e is not null, e);

  perform t.act_as(990502);
  perform t.ok('See: a member sees it once it''s advertised', exists (select 1 from public.events where id = t.id('open')));
  perform t.ok('See: not before the advertise date', not exists (select 1 from public.events where id = t.id('later')));
  e := t.err(format('select public.enter_event(%s)', t.id('later')));
  perform t.ok('Enter: refused before entries open', e like '%Entries open on%', e);
  e := t.err(format('select public.enter_event(%s)', t.id('closed')));
  perform t.ok('Enter: refused after entries close', e like '%Entries have closed%', e);
  perform public.enter_event(t.id('open'));
  perform t.ok('Enter: in', (select 990502 = any (players) from public.events where id = t.id('open')));
  reset role;

  perform t.act_as(990503);
  perform public.enter_event(t.id('open'));
  reset role;
  perform t.act_as(990504);
  e := t.err(format('select public.enter_event(%s)', t.id('open')));
  perform t.ok('Enter: the last place has gone', e like '%it''s full%', e);
  reset role;

  perform t.act_as(990503);
  perform public.withdraw_event(t.id('open'));
  reset role;
  perform t.act_as(990504);
  perform public.enter_event(t.id('open'));
  perform t.ok('Withdraw opens a place for someone else', (select 990504 = any (players) and not 990503 = any (players) from public.events where id = t.id('open')));
  e := t.err(format('select public.remove_event_entrant(%s, %s)', t.id('open'), 990502));
  perform t.ok('Remove: a member can''t take someone off', e is not null, e);
  reset role;

  perform t.act_as(990501);
  perform t.ok('See: the office sees one not yet advertised', exists (select 1 from public.events where id = t.id('later')));
  perform public.remove_event_entrant(t.id('open'), 990502);
  perform t.ok('Remove: the office takes someone off', (select not 990502 = any (players) from public.events where id = t.id('open')));
  reset role;
end $$;

-- Found in review: the club's own date, visibility after entries close, on-the-day entry, empty team lists.
with e as (insert into public.events (name, start_date, style, fmt, club, everyone, created_by, self_entry, players)
  values ('Started Day Cup', current_date, 'teams', 'teamstab', true, false, 990501, true, '{990502}') returning id)
insert into t.ev select 'started', id from e;
with e as (insert into public.events (name, start_date, style, fmt, club, everyone, created_by, weeks, best_of, signup, max_entries, players, league_teams)
  values ('Team League', current_date + 30, 'league', 'beststab', true, false, 990501, 10, 4, true, 10, '{990503}', '[]') returning id)
insert into t.ev select 'teams', id from e;

do $$ declare e text; begin
  perform t.ok('club_today: the club''s date (UK time), not the server''s', public.club_today() = (now() at time zone 'Europe/London')::date);
  perform t.act_as(990503);
  perform t.ok('See: not once entries have closed (for a member not in it)', not exists (select 1 from public.events where id = t.id('closed')));
  perform public.withdraw_event(t.id('teams'));
  perform t.ok('Withdraw: an empty team list stays an empty list', (select league_teams = '[]'::jsonb from public.events where id = t.id('teams')));
  reset role;
  perform t.act_as(990502);
  e := t.err(format('select public.enter_event(%s)', t.id('started')));
  perform t.ok('On the day: entering after the start is still refused, even when already in', e like '%has started%', e);
  e := t.err(format('select public.withdraw_event(%s)', t.id('started')));
  perform t.ok('On the day: the withdraw message as before', e like '%has started. Ask an admin%', e);
  reset role;
end $$;

select test, ok, detail from t.results order by n;
rollback;
