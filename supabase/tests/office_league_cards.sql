-- Database tests: the club office sorts out unfinished league cards. Rolled back.
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

insert into public.members (id, name, admin) values (997001, 'Office Tester', true), (997002, 'Pat Reid', false), (997003, 'Orla Ryan', false);
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'olc-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 3) i;
update public.members m set user_id = (select id from auth.users where email = 'olc-' || (m.id - 997000) || '@example.invalid') where m.id between 997001 and 997003;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;

insert into public.events (id, name, start_date, style, fmt, club, everyone, weeks, best_of, players) values
  (997101, 'Winter league', public.club_today() - 3, 'league', 'beststab', true, false, 6, 4, array[997002, 997003]::bigint[]);
-- Pat and Orla's card: one hole saved, both entered for week 1.
insert into public.rounds (id, date, created_by, game, pairing, scores, done, submitted, lineup) values
  (997201, public.club_today() - 1, 997002, 'stab', 0, (select jsonb_agg('[4, 4]'::jsonb) from generate_series(1, 18)),
   (select jsonb_agg(i = 1) from generate_series(1, 18) i), '{}', '[{"m": 997002}, {"m": 997003}]');
insert into public.league_entries (event_id, week, member_id, round_id) values (997101, 1, 997002, 997201), (997101, 1, 997003, 997201);

do $$ declare e text; begin
  perform t.act_as(997002);
  e := t.err('select public.leave_league(997201, 997101, array[997002]::bigint[])');
  reset role;
  perform t.ok('League cards: a player can''t leave once a hole is saved', e = 'Entries are locked once the first hole is saved.', e);

  perform t.act_as(997003);
  e := t.err('select public.office_take_out_league(997101, 997002, 1)');
  reset role;
  perform t.ok('League cards: only the office takes a player out', e = 'Only the club office can take a player out of a league week.', e);

  perform t.act_as(997001);
  perform public.office_take_out_league(997101, 997002, 1);
  reset role;
  perform t.ok('League cards: taken out of the week, the card and the others stay',
    not exists (select 1 from public.league_entries where member_id = 997002 and event_id = 997101)
    and exists (select 1 from public.league_entries where member_id = 997003 and round_id = 997201)
    and exists (select 1 from public.rounds where id = 997201));

  perform t.act_as(997001);
  e := t.err('select public.office_take_out_league(997101, 997002, 1)');
  reset role;
  perform t.ok('League cards: taking out twice says so', e = 'They aren''t entered in that week any more.', e);

  perform t.act_as(997003);
  e := t.err('select public.office_delete_league_card(997201)');
  reset role;
  perform t.ok('League cards: only the office deletes a player''s card', e = 'Only the club office can delete a player''s card.', e);

  perform t.act_as(997001);
  perform public.office_delete_league_card(997201);
  reset role;
  perform t.ok('League cards: delete an unfinished card, its entries go too',
    not exists (select 1 from public.rounds where id = 997201) and not exists (select 1 from public.league_entries where round_id = 997201));

  insert into public.rounds (id, date, created_by, game, pairing, scores, done, submitted, lineup) values
    (997202, public.club_today() - 1, 997002, 'stab', 0, (select jsonb_agg('[4, 4]'::jsonb) from generate_series(1, 18)),
     (select jsonb_agg(true) from generate_series(1, 18)), '{}', '[{"m": 997002}, {"m": 997003}]');
  insert into public.league_entries (event_id, week, member_id, round_id) values (997101, 1, 997002, 997202);
  perform t.act_as(997001);
  e := t.err('select public.office_delete_league_card(997202)');
  reset role;
  perform t.ok('League cards: a finished card isn''t deleted', e = 'That card is finished. Take a player out of the week instead.', e);
end $$;

select test, ok, detail from t.results order by n;
rollback;
