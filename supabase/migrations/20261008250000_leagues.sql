-- Leagues: many teams over several weeks (e.g. a Winter League: 10 teams of 12, 6 weeks, best 7
-- Stableford scores per team count each week). Set up by admins. Only the league's players (and
-- admins) see it. Players choose BEFORE they play whether a round is entered: one entry per player
-- per week, and only before the card's first hole is saved.
--
-- events, for style 'league':  start_date = Monday of week 1; weeks; best_of (scores that count per
--   team per week); league_teams = [{ name, col }]; team = { "<member id>": team index (0-based) }.

alter table public.events
  add column weeks int check (weeks between 1 and 26),
  add column best_of int check (best_of between 1 and 30),
  add column league_teams jsonb;
alter table public.events drop constraint event_style, drop constraint event_fmt;
alter table public.events
  add constraint event_style check (style in ('ryder', 'teams', 'individual', 'league')),
  add constraint event_fmt check (
    (style = 'ryder' and fmt in ('bbl', 'bbstab', 'bbscr')) or (style = 'teams' and fmt = 'teamstab') or
    (style = 'individual' and fmt in ('stab', 'net')) or
    (style = 'league' and fmt = 'beststab' and weeks is not null and best_of is not null and jsonb_array_length(league_teams) between 2 and 20));

-- Only admins can set up a league.
create or replace function public.event_is_league_ok(p_style text) returns boolean
language sql stable security definer set search_path = '' as $$ select p_style <> 'league' or public.is_admin() $$;
grant execute on function public.event_is_league_ok(text) to authenticated;
drop policy "create my own (club events: admins)" on public.events;
create policy "create my own (club events and leagues: admins)" on public.events for insert to authenticated
  with check (created_by = public.current_member_id() and (not club or public.is_admin()) and public.event_is_league_ok(style));

create table public.league_entries (
  event_id bigint not null references public.events on delete cascade,
  week int not null,
  member_id bigint not null references public.members on delete cascade,
  round_id bigint not null references public.rounds on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, week, member_id)           -- one entered round per player per week
);
create index on public.league_entries (round_id);
alter table public.league_entries enable row level security;
revoke all on public.league_entries from anon, authenticated;
grant select on public.league_entries to authenticated;
create policy "players in the league, or admins" on public.league_entries for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id)); -- events RLS decides who sees the league

-- Enter players on my card into a league for this week. Must be before the first hole is saved.
create function public.enter_league(p_round bigint, p_event bigint, p_members bigint[]) returns int
language plpgsql security definer set search_path = '' as $$
declare r public.rounds; e public.events; v_week int; m bigint;
begin
  select * into r from public.rounds where id = p_round;
  if r.id is null or r.created_by is distinct from public.current_member_id() then
    raise exception 'You can only enter rounds from your own card.' using errcode = '42501';
  end if;
  select * into e from public.events where id = p_event and style = 'league';
  if e.id is null then
    raise exception 'That league no longer exists.' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(r.done) d where d = 'true') then
    raise exception 'Rounds have to be entered before the first hole is saved.' using errcode = 'P0001';
  end if;
  v_week := (r.date - e.start_date) / 7 + 1;
  if r.date < e.start_date or v_week > e.weeks then
    raise exception 'The league isn''t running this week.' using errcode = 'P0001';
  end if;
  foreach m in array p_members loop
    if not m = any(e.players) then
      raise exception 'One of those players isn''t in the league.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from jsonb_array_elements(r.lineup) x where (x->>'m')::bigint = m) then
      raise exception 'One of those players isn''t on this card.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.league_entries where event_id = e.id and week = v_week and member_id = m and round_id <> r.id) then
      raise exception '% has already entered a round this week.', (select name from public.members where id = m) using errcode = 'P0001';
    end if;
    insert into public.league_entries (event_id, week, member_id, round_id) values (e.id, v_week, m, r.id) on conflict do nothing;
  end loop;
  return v_week;
end $$;

-- Take players off this card's entry (only before the first hole is saved).
create function public.leave_league(p_round bigint, p_event bigint, p_members bigint[]) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.rounds;
begin
  select * into r from public.rounds where id = p_round;
  if r.id is null or r.created_by is distinct from public.current_member_id() then
    raise exception 'You can only change entries on your own card.' using errcode = '42501';
  end if;
  if exists (select 1 from jsonb_array_elements(r.done) d where d = 'true') then
    raise exception 'Entries are locked once the first hole is saved.' using errcode = 'P0001';
  end if;
  delete from public.league_entries where round_id = r.id and event_id = p_event and member_id = any(p_members);
end $$;

revoke execute on function public.enter_league(bigint, bigint, bigint[]), public.leave_league(bigint, bigint, bigint[]) from public, anon;
grant execute on function public.enter_league(bigint, bigint, bigint[]), public.leave_league(bigint, bigint, bigint[]) to authenticated;
