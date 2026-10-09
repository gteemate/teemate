-- Leagues: captain candidates. The organiser lists them; the app draws one at random for each team
-- (stored as league_teams[k].captain). Extra candidates just play as ordinary entrants.
alter table public.events add column captain_pool bigint[] not null default '{}';
