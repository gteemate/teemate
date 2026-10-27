-- Database tests: when something is deleted, it goes (or is let go of) everywhere it shows. Rolled back.
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

-- 991201 office, 991202 Alex, 991203 Bea (deleted later), 991204 Cal
insert into public.members (id, name, admin) values (991201, 'Office R', true), (991202, 'Alex Ripple', false), (991203, 'Bea Ripple', false), (991204, 'Cal Ripple', false);
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'rp-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 4) i;
update public.members m set user_id = (select id from auth.users where email = 'rp-' || (m.id - 991200) || '@example.invalid') where m.id between 991201 and 991204;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;

do $$ declare v_ev bigint; v_lg bigint; v_card bigint; v_card2 bigint; v_comp bigint; v_ea bigint; v_eb bigint; v_m bigint; v_order bigint; begin
  -- An event, a league and a knockout with Alex and Bea; Alex's unfinished card with Bea on it counts for all three.
  insert into public.events (name, start_date, days, style, fmt, players, created_by, entry_required)
    values ('Ripple Cup', current_date, 1, 'individual', 'stab', '{991202,991203,991204}', 991202, true) returning id into v_ev;
  insert into public.events (name, start_date, style, fmt, weeks, best_of, league_teams, players, team)
    values ('Ripple League', current_date - extract(isodow from current_date)::int + 1, 'league', 'beststab', 6, 7,
            '[{"name":"Team 1","captain":991203},{"name":"Team 2"}]', '{991202,991203,991204}', '{"991202":0,"991203":0,"991204":1}') returning id into v_lg;
  insert into public.rounds (created_by, lineup, scores, done, game, date)
    values (991202, '[{"m":991202},{"m":991203}]', (select jsonb_agg('[4,4]'::jsonb) from generate_series(1, 18)), (select jsonb_agg(false) from generate_series(1, 18)), 'stab', current_date) returning id into v_card;
  insert into public.event_entries (event_id, day, member_id, round_id) values (v_ev, 1, 991202, v_card), (v_ev, 1, 991203, v_card);
  insert into public.league_entries (event_id, week, member_id, round_id) values (v_lg, 1, 991202, v_card), (v_lg, 1, 991203, v_card);
  insert into public.signup_comps (name, category, kind, closes_on, open) values ('Ripple KO', 'open', 'singles', current_date - 1, false) returning id into v_comp;
  insert into public.signup_entries (comp_id, member_id) values (v_comp, 991202) returning id into v_ea;
  insert into public.signup_entries (comp_id, member_id) values (v_comp, 991203) returning id into v_eb;
  insert into public.ko_matches (comp_id, round, slot, a_entry, b_entry, round_id) values (v_comp, 1, 0, v_ea, v_eb, v_card) returning id into v_m;

  -- 1. The unfinished card is deleted by Bea (she's on it).
  perform t.act_as(991203);
  delete from public.rounds where id = v_card;
  reset role;
  perform t.ok('A deleted card: gone', not exists (select 1 from public.rounds where id = v_card));
  perform t.ok('A deleted card: no longer counts for the event, for anyone on it', not exists (select 1 from public.event_entries where round_id = v_card));
  perform t.ok('A deleted card: no longer counts for the league, for anyone on it', not exists (select 1 from public.league_entries where round_id = v_card));
  perform t.ok('A deleted card: the knockout match no longer points at it', (select round_id is null from public.ko_matches where id = v_m));

  -- 2. Bea is deleted by the office. Cal has a card with Bea on it (history), and asked Bea to confirm a paper score.
  insert into public.rounds (created_by, lineup, scores, done, game, date)
    values (991204, '[{"m":991204},{"m":991203}]', (select jsonb_agg('[4,4]'::jsonb) from generate_series(1, 18)), (select jsonb_agg(true) from generate_series(1, 18)), 'stab', current_date) returning id into v_card2;
  perform t.act_as(991204);
  perform public.mark_paper_card(v_card2, 1, 991203);
  reset role;
  perform t.act_as(991201);
  perform public.admin_delete_member(991203);
  reset role;
  perform t.ok('A deleted member: off every event’s players', not exists (select 1 from public.events where 991203 = any (players)));
  perform t.ok('A deleted member: off every team', not exists (select 1 from public.events where team ? '991203'));
  perform t.ok('A deleted member: no longer a league team’s captain', not exists (select 1 from public.events e, jsonb_array_elements(coalesce(e.league_teams, '[]')) x where (x->>'captain')::bigint = 991203));
  perform t.ok('A deleted member: their knockout entry goes, and the match no longer names it', not exists (select 1 from public.signup_entries where member_id = 991203) and (select b_entry is null from public.ko_matches where id = v_m));
  perform t.ok('A deleted member: a paper score they were asked to confirm goes to the office', (select paper_confirmer is null and paper_state = 'waiting' from public.rounds where id = v_card2));
  perform t.ok('A deleted member: other people’s finished cards keep their scores (as history)', (select jsonb_array_length(lineup) = 2 from public.rounds where id = v_card2));

  -- 3. The event is deleted: its entries go; the cards stay.
  insert into public.event_entries (event_id, day, member_id, round_id) values (v_ev, 1, 991204, v_card2);
  delete from public.events where id = v_ev;
  perform t.ok('A deleted event: its entries go', not exists (select 1 from public.event_entries where event_id = v_ev));
  perform t.ok('A deleted event: the cards that counted for it stay', exists (select 1 from public.rounds where id = v_card2));
end $$;

select test, ok, detail from t.results order by n;
rollback;
