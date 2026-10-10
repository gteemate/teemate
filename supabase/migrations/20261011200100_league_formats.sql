-- Leagues without teams (a member's singles league is just its players' table) and pairs leagues (league_pairs).
alter table public.events drop constraint event_fmt;
alter table public.events add constraint event_fmt check (
  (style = 'ryder' and fmt in ('bbl', 'bbstab', 'bbscr')) or (style = 'teams' and fmt = 'teamstab') or (style = 'individual' and fmt in ('stab', 'net'))
  or (style = 'league' and fmt = 'beststab' and weeks is not null and best_of is not null and jsonb_array_length(coalesce(league_teams, '[]')) <= 20
      and (league_pairs is null or jsonb_typeof(league_pairs) = 'array')));
