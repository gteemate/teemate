-- Scenario data for the TEST database: every situation the app handles, so each screen can be checked before a
-- release. Loaded after supabase/seed.sql (the sample club) by `npm run db:scenarios`; the script refuses to run on
-- the live database. Dates are relative to the day it's loaded. Members (from src/sample-data.js):
--   0 Gary Cochrane (admin; signs in with OWNER_EMAIL), 1 Declan Murphy, 2 Aoife Brennan, 3 Ciarán O'Neill,
--   4 Siobhán Kelly, 5 Mark Doherty, 6 Niall Gallagher, 7 Peter Walsh, 8 Róisín McCarthy, 9 Eoin Fitzgerald,
--   10 Tom Byrne, 11 Liam Quinn, 12 Orla Ryan.
-- What each scenario is for is written next to it; signed in as Gary you meet most of them.

-- ---------------------------------------------------------------- start clean (what seed.sql doesn't clear)
delete from public.signup_comps;          -- with entries, draws, no-thanks
delete from public.access_requests;
delete from public.tee_time_requests;
delete from public.booking_notices;
delete from public.hut_orders;
delete from public.hut_menu;
delete from public.player_events;
delete from public.member_balances;

-- ---------------------------------------------------------------- the club
update public.club_settings set club_name = 'Royal Teemate Golf Club', fee_payment = 'purse', hut_on = true where id = 1;
update public.members set plays_in = case when id in (2, 4, 8, 12) then 'ladies' else 'men' end;

-- Helpers for this load only.
create function pg_temp.slot(p_day int, p_time int) returns bigint language plpgsql as $$
declare s bigint;
begin
  select id into s from public.tee_slots where date = current_date + p_day and start_time = p_time;
  if s is null then
    insert into public.tee_slots (course_id, date, start_time, twilight) values (1, current_date + p_day, p_time, p_time >= 900) returning id into s;
  end if;
  return s;
end $$;
-- Book a tee time for these members (the first books it), clearing whoever the sample club had there.
create function pg_temp.book(p_day int, p_time int, p_ids bigint[]) returns bigint language plpgsql as $$
declare s bigint := pg_temp.slot(p_day, p_time); b bigint; x bigint;
begin
  delete from public.booking_players where slot_id = s;
  delete from public.bookings where slot_id = s;
  delete from public.booking_players bp using public.tee_slots t where t.id = bp.slot_id and t.date = current_date + p_day and bp.member_id = any(p_ids) and bp.slot_id <> s;
  insert into public.bookings (slot_id, booked_by) values (s, p_ids[1]) returning id into b;
  foreach x in array p_ids loop
    insert into public.booking_players (booking_id, slot_id, member_id) values (b, s, x);
  end loop;
  return b;
end $$;

-- ---------------------------------------------------------------- Gary's tee times (Booking, Home)
select pg_temp.book(0, 570, '{0,1,3,5}');      -- today 09:30, a four-ball (his card from the sample club is this group)
select pg_temp.book(2, 600, '{0,7}');          -- in 2 days, 10:00 with Peter: room for two more (a match's "Add the rest")
select pg_temp.book(5, 500, '{0}');            -- in 5 days, 08:20 on his own: the office moved it here (notice below)

-- ---------------------------------------------------------------- club events
-- Today's club Stableford: anyone starting a round is asked to play in it, with a £5 fee from the purse.
insert into public.events (name, team_a, team_b, start_date, days, style, fmt, players, team, matches, club, everyone, self_entry, entry_required, entry_fee_pence, created_by)
values ('Saturday Stableford', '{"name":"Blues","col":"#19335A"}', '{"name":"Reds","col":"#762A43"}', current_date, 1, 'individual', 'stab', '{}', '{}', '{}', true, true, true, true, 500, 0);

-- A three-day Ryder Cup starting tomorrow, with Gary's match in a different booking state each day:
--   day 1: all four booked together (Start scoring on the day) · day 2: Gary and Peter booked, room for the rest
--   (Add the rest) · day 3: nobody in Gary's match booked, an opponent booked with others at 08:00 (Book this match,
--   2 hours or more from that).
insert into public.events (name, team_a, team_b, start_date, days, style, fmt, players, team, matches, club, everyone, entry_required, created_by)
values ('Christmas Cup', '{"name":"Cats","col":"#C9C51A"}', '{"name":"Dogs","col":"#0B6E8F"}', current_date + 1, 3, 'ryder', 'bbl',
  '{0,1,3,5,7,9,10,11,2,4}', '{"0":"A","1":"A","7":"A","11":"A","10":"A","3":"B","5":"B","9":"B","2":"B","4":"B"}',
  '{"1":[{"a":[0,1],"b":[3,5]}],"2":[{"a":[0,7],"b":[9,10]}],"3":[{"a":[0,11],"b":[2,4]}]}', true, true, true, 0);
select pg_temp.book(1, 660, '{0,1,3,5}');
select pg_temp.book(3, 480, '{2,12,6}');

-- A club team league in week 3 of 6 (Gary on Team 1).
insert into public.events (name, team_a, team_b, start_date, days, style, fmt, weeks, best_of, league_teams, players, team, matches, club, everyone, entry_required, created_by)
values ('Winter League', '{"name":"A","col":"#19335A"}', '{"name":"B","col":"#762A43"}', current_date - 14, 1, 'league', 'beststab', 6, 3,
  '[{"name":"Team 1","col":"#19335a","size":6},{"name":"Team 2","col":"#762a43","size":6}]', '{0,1,3,5,7,9,10,11}',
  '{"0":0,"1":0,"3":0,"5":0,"7":1,"9":1,"10":1,"11":1}', '{}', true, true, false, 0);

-- Gary's own pairs league: the season is over and the top 4 go into a knockout he hasn't started yet
-- (Competitions → Entered: "Season over: knockout next"; the board: Start the knockout).
insert into public.events (name, team_a, team_b, start_date, days, style, fmt, weeks, best_of, league_teams, league_pairs, players, team, matches, club, everyone, entry_required, ko_top, ko_finish, created_by)
values ('Pals Pairs League', '{"name":"A","col":"#19335A"}', '{"name":"B","col":"#762A43"}', current_date - 35, 1, 'league', 'beststab', 4, 1,
  '[]', '[[0,1],[3,5],[7,11],[9,10]]', '{0,1,3,5,7,11,9,10}', '{}', '{}', false, false, false, 4, current_date + 40, 0);

-- ---------------------------------------------------------------- knockouts and sign-up competitions
create function pg_temp.comp(p_name text, p_cat text, p_kind text, p_open boolean, p_closes int, p_drawn boolean, p_max int default null, p_fee int default null, p_by bigint default null)
returns bigint language sql as $$
  insert into public.signup_comps (name, category, kind, closes_on, open, draw_published, max_entries, entry_fee_pence, created_by, round_deadlines, final_by)
  values (p_name, p_cat, p_kind, current_date + p_closes, p_open, p_drawn, p_max, p_fee, p_by,
          case when p_drawn then array[current_date + p_closes + 14, current_date + p_closes + 35, current_date + p_closes + 56] else '{}' end, current_date + p_closes + 60)
  returning id
$$;
create function pg_temp.enter(p_comp bigint, p_member bigint, p_partner bigint default null) returns bigint language sql as $$
  insert into public.signup_entries (comp_id, member_id, partner_id) values (p_comp, p_member, p_partner) returning id
$$;
create function pg_temp.match(p_comp bigint, p_round int, p_slot int, p_a bigint, p_b bigint, p_status text, p_winner bigint default null, p_result text default null, p_reported bigint default null)
returns void language sql as $$
  insert into public.ko_matches (comp_id, round, slot, a_entry, b_entry, status, winner_entry, result, reported_entry)
  values (p_comp, p_round, p_slot, p_a, p_b, p_status, p_winner, p_result, p_reported)
$$;

do $$
declare c bigint; e bigint[] := '{}'; x bigint;
begin
  -- Templates (club office → Competitions → Templates): hidden, ready to run. Men's Match Play was played last year
  -- (its champion shows as "last won by").
  c := pg_temp.comp('Men''s Match Play', 'men', 'singles', false, -300, true);
  e := '{}'; foreach x in array '{1,3,5,7}'::bigint[] loop e := e || pg_temp.enter(c, x); end loop;
  perform pg_temp.match(c, 1, 0, e[1], e[2], 'confirmed', e[1], '3&2');
  perform pg_temp.match(c, 1, 1, e[3], e[4], 'confirmed', e[4], '1 up');
  perform pg_temp.match(c, 2, 0, e[1], e[4], 'confirmed', e[4], '2&1');
  perform pg_temp.comp('Ladies Singles', 'ladies', 'singles', false, -300, false);
  perform pg_temp.comp('Men''s Fourball', 'men', 'pairs', false, -300, false);

  -- Open for entries (Competitions → Events): Enter / No thanks, a £5 fee, 11 places left.
  c := pg_temp.comp('Autumn Singles', 'open', 'singles', true, 14, false, 16, 500);
  foreach x in array '{2,4,6,8,10}'::bigint[] loop perform pg_temp.enter(c, x); end loop;
  -- Full: all 4 places taken.
  c := pg_temp.comp('Seniors Singles', 'men', 'singles', true, 10, false, 4);
  foreach x in array '{3,5,6,9}'::bigint[] loop perform pg_temp.enter(c, x); end loop;
  -- Gary said No thanks: it's under Declined, where he can still enter.
  c := pg_temp.comp('Mixed Foursome', 'mixed', 'pairs', true, 12, false, null, 1000);
  insert into public.signup_declines (comp_id, member_id) values (c, 0);
  -- Gary has entered, the draw isn't out yet (Entered, with Withdraw).
  c := pg_temp.comp('Club Fourball', 'men', 'pairs', true, 7, false);
  perform pg_temp.enter(c, 0, 11); perform pg_temp.enter(c, 3, 5);

  -- Drawn and published, Gary's first match to play (Book this match / Score this match / Enter result); another
  -- match won, one waiting for the other side to confirm.
  c := pg_temp.comp('Club Singles', 'men', 'singles', true, -3, true);
  e := '{}'; foreach x in array '{0,9,1,3,5,6,7,10}'::bigint[] loop e := e || pg_temp.enter(c, x); end loop;
  perform pg_temp.match(c, 1, 0, e[1], e[2], 'open');
  perform pg_temp.match(c, 1, 1, e[3], e[4], 'confirmed', e[3], '2&1');
  perform pg_temp.match(c, 1, 2, e[5], e[6], 'reported', e[5], '4&3', e[5]);
  perform pg_temp.match(c, 1, 3, e[7], e[8], 'open');
  perform pg_temp.match(c, 2, 0, null, e[3], 'open');
  perform pg_temp.match(c, 2, 1, null, null, 'open');
  perform pg_temp.match(c, 3, 0, null, null, 'open');

  -- Pairs: the other side entered a result against Gary and Liam (Confirm / That's not right); another match is
  -- disputed (club office → Today: Set the result).
  c := pg_temp.comp('Winter Foursomes', 'men', 'pairs', true, -5, true);
  e := '{}';
  e := e || pg_temp.enter(c, 0, 11) || pg_temp.enter(c, 3, 5) || pg_temp.enter(c, 7, 1) || pg_temp.enter(c, 9, 10);
  perform pg_temp.match(c, 1, 0, e[1], e[2], 'reported', e[2], '2 up', e[2]);
  perform pg_temp.match(c, 1, 1, e[3], e[4], 'disputed', e[3], '3&2', e[3]);
  perform pg_temp.match(c, 2, 0, null, null, 'open');

  -- Entries closed, a draft draw only the club office sees (swap names, play-by dates, Publish).
  c := pg_temp.comp('Captain''s Prize', 'open', 'singles', true, -2, false);
  e := '{}'; foreach x in array '{1,2,3,4,5,6}'::bigint[] loop e := e || pg_temp.enter(c, x); end loop;
  perform pg_temp.match(c, 1, 0, e[1], e[2], 'open'); perform pg_temp.match(c, 1, 1, e[3], e[4], 'open');
  perform pg_temp.match(c, 1, 2, e[5], null, 'bye', e[5]); perform pg_temp.match(c, 1, 3, e[6], null, 'bye', e[6]);
  perform pg_temp.match(c, 2, 0, null, null, 'open'); perform pg_temp.match(c, 2, 1, e[5], e[6], 'open');
  perform pg_temp.match(c, 3, 0, null, null, 'open');

  -- Finished: Gary is the champion (the draw's champion banner).
  c := pg_temp.comp('Spring Knockout', 'men', 'singles', false, -120, true);
  e := '{}'; foreach x in array '{0,5,7,9}'::bigint[] loop e := e || pg_temp.enter(c, x); end loop;
  perform pg_temp.match(c, 1, 0, e[1], e[2], 'confirmed', e[1], '5&4');
  perform pg_temp.match(c, 1, 1, e[3], e[4], 'confirmed', e[3], 'At the 19th');
  perform pg_temp.match(c, 2, 0, e[1], e[3], 'confirmed', e[1], '1 up');

  -- A knockout a member organised for his group, with Gary in it (Entered).
  c := pg_temp.comp('Ciarán''s Knockout', 'open', 'singles', false, -1, true, null, null, 3);
  e := '{}'; foreach x in array '{3,0,1,5}'::bigint[] loop e := e || pg_temp.enter(c, x); end loop;
  perform pg_temp.match(c, 1, 0, e[1], e[2], 'open'); perform pg_temp.match(c, 1, 1, e[3], e[4], 'open');
  perform pg_temp.match(c, 2, 0, null, null, 'open');
end $$;

-- ---------------------------------------------------------------- tee time requests (days not open yet)
insert into public.tee_time_requests (member_id, slot_id, member_ids, guests, reason, status, admin_note, decided_by, decided_at, booking_id, seen, created_at) values
  -- Gary's, waiting for the office (Booking: Requested)
  (0, pg_temp.slot(10, 540), '{1}', '[]', 'Visitors from Boston that week', 'pending', null, null, null, null, false, now() - interval '1 day'),
  -- Gary's, declined with a note he hasn't seen yet (drops down from the top)
  (0, pg_temp.slot(11, 480), '{}', '[]', 'Early start before work', 'declined', 'Medal that morning. Try 12:00?', 0, now() - interval '2 hours', null, false, now() - interval '2 days'),
  -- someone else's, waiting (club office → Today and Tee sheet)
  (5, pg_temp.slot(12, 600), '{6,9}', '[{"name":"Sam Visitor","club":"Royal Portrush"}]', 'Society day: three of us and a guest', 'pending', null, null, null, null, false, now() - interval '3 hours');

-- ---------------------------------------------------------------- the club office changed Gary's booking
insert into public.booking_notices (member_id, kind, date, old_time, new_time, new_date, note, seen)
values (0, 'moved', current_date + 5, 520, 500, current_date + 5, 'A society has the tee at 08:40', false);

-- ---------------------------------------------------------------- people asking to join (club office → Members)
insert into public.access_requests (email, name, created_at) values
  ('sean.byrne@example.invalid', 'Sean Byrne', now() - interval '1 day'),
  ('aoife.kelly@example.invalid', 'Aoife Kelly', now() - interval '3 hours');

-- ---------------------------------------------------------------- halfway hut (on, with orders today)
insert into public.hut_menu (section, name, price_pence, sold_out, sort) values
  ('Food', 'Bacon roll', 450, false, 1), ('Food', 'Sausage roll', 400, false, 2), ('Food', 'Toastie', 500, true, 3),
  ('Drinks', 'Tea', 250, false, 1), ('Drinks', 'Coffee', 300, false, 2);
insert into public.hut_orders (member_id, items, total_pence, note, status, created_at) values
  (0, '[{"id":1,"name":"Bacon roll","qty":2,"pricePence":450},{"id":4,"name":"Tea","qty":1,"pricePence":250}]', 1150, 'Brown sauce please', 'ready', now() - interval '20 minutes'),
  (3, '[{"id":2,"name":"Sausage roll","qty":1,"pricePence":400}]', 400, null, 'sent', now() - interval '10 minutes'),
  (9, '[{"id":5,"name":"Coffee","qty":2,"pricePence":300}]', 600, null, 'sent', now() - interval '5 minutes');

-- ---------------------------------------------------------------- balances (Account; the entry fee line)
insert into public.member_balances (member_id, competition_pence, clubhouse_pence, source) values
  (0, 4250, 1210, 'example'),   -- plenty: "£37.50 left after this"
  (1, 300, 0, 'example');       -- short of a £5 fee: "top it up before entries close"

select (select count(*) from public.signup_comps) as competitions, (select count(*) from public.ko_matches) as ko_matches,
       (select count(*) from public.events) as events, (select count(*) from public.tee_time_requests) as requests,
       (select count(*) from public.hut_orders) as hut_orders, (select user_id is not null from public.members where id = 0) as gary_has_login;
