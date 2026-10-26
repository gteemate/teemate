-- Four-ball team match play over a season: a ryder event marked season runs from its start date for `days` days
-- (up to a year), with matches only on the match days its organiser adds (any number each; a match with one player a
-- side is a singles). Changes during the season go through save_season, which keeps the rules: nobody switches
-- teams, started match days stay as they were, one match per player per day.

alter table public.events add column season boolean not null default false;
alter table public.events drop constraint events_days_check;
alter table public.events add constraint events_days_check check (days between 1 and 3 or (season and days between 1 and 366));
alter table public.events add constraint event_season_ryder check (not season or style = 'ryder');
grant select (season) on public.events to authenticated;

-- A match day has started when a card counted for it has a hole saved (or its date has passed).
create function public.season_day_started(p_event bigint, p_day int) returns boolean
language sql stable security definer set search_path to '' as $$
  select (e.start_date + p_day - 1) < current_date
      or ((e.start_date + p_day - 1) = current_date and exists (
           select 1 from public.event_entries x join public.rounds r on r.id = x.round_id
            where x.event_id = e.id and x.day = p_day and exists (select 1 from jsonb_array_elements(r.done) d where d = 'true')))
    from public.events e where e.id = p_event
$$;
revoke execute on function public.season_day_started(bigint, int) from public, anon;

-- Change a season: its end date, teams (full { id: 'A'|'B' }) and matches (full { day: [{ a, b }] }).
create function public.save_season(p_event bigint, p_end date, p_team jsonb, p_matches jsonb) returns void
language plpgsql security definer set search_path to '' as $$
declare e public.events; v_days int; d text; m jsonb; ids bigint[]; x bigint; k text; v_day int; seen bigint[];
begin
  select * into e from public.events where id = p_event for update;
  if e.id is null or not e.season then raise exception 'That season no longer exists.' using errcode = 'P0001'; end if;
  if not (public.is_admin() or e.created_by = public.current_member_id()) then
    raise exception 'Only the organiser can change this season.' using errcode = '42501';
  end if;
  if not public.is_admin() and current_date > e.start_date + e.days - 1 then
    raise exception 'This season has finished.' using errcode = 'P0001';
  end if;
  v_days := p_end - e.start_date + 1;
  if p_end < current_date or v_days < 1 or v_days > 366 then
    raise exception 'Pick an end date from today, within a year of the start.' using errcode = 'P0001';
  end if;

  -- Teams: nobody already in it changes team; anyone taken out hasn't played.
  for k in select jsonb_object_keys(e.team) loop
    if p_team ? k and p_team->>k <> e.team->>k then
      raise exception 'Players can''t change teams during a season.' using errcode = 'P0001';
    end if;
  end loop;
  for k in select jsonb_object_keys(p_team) loop
    if p_team->>k not in ('A', 'B') then raise exception 'Every player needs a team.' using errcode = 'P0001'; end if;
  end loop;

  -- Started match days stay exactly as they were (and none can be added in the past).
  for d in select jsonb_object_keys(e.matches) union select jsonb_object_keys(p_matches) loop
    v_day := d::int;
    if public.season_day_started(e.id, v_day) and coalesce(e.matches->d, '[]') is distinct from coalesce(p_matches->d, '[]') then
      raise exception 'That match day has started; its matches can''t change.' using errcode = 'P0001';
    end if;
  end loop;
  for d in select jsonb_object_keys(e.matches) loop
    if public.season_day_started(e.id, d::int) then
      for x in select p::text::bigint from jsonb_array_elements(e.matches->d) mt, jsonb_array_elements(mt->'a' || mt->'b') p loop
        if not p_team ? x::text then raise exception 'A player who has played can''t be taken out.' using errcode = 'P0001'; end if;
      end loop;
    end if;
  end loop;

  -- Every match: 2 v 2 or 1 v 1, side a from team A and side b from team B, each player once a day, inside the season.
  for d in select jsonb_object_keys(p_matches) loop
    v_day := d::int;
    if jsonb_array_length(p_matches->d) > 0 and v_day > v_days then
      raise exception 'A match day is after the end date.' using errcode = 'P0001';
    end if;
    if v_day < 1 then raise exception 'A match day is before the start.' using errcode = 'P0001'; end if;
    seen := '{}';
    for m in select jsonb_array_elements(p_matches->d) loop
      if jsonb_array_length(m->'a') <> jsonb_array_length(m->'b') or jsonb_array_length(m->'a') not in (1, 2) then
        raise exception 'A match is a four-ball (2 v 2) or a singles (1 v 1).' using errcode = 'P0001';
      end if;
      for k in select 'a' union all select 'b' loop
        for x in select jsonb_array_elements(m->k)::text::bigint loop
          if p_team->>(x::text) is distinct from upper(k) then
            raise exception 'Each side of a match is from one team.' using errcode = 'P0001';
          end if;
          if x = any (seen) then raise exception 'A player can''t be in two matches on one day.' using errcode = 'P0001'; end if;
          seen := seen || x;
        end loop;
      end loop;
    end loop;
  end loop;

  select coalesce(array_agg(j.key::bigint order by j.key::bigint), '{}') into ids from jsonb_object_keys(p_team) j(key);
  update public.events set days = v_days, team = p_team, players = ids,
    matches = (select coalesce(jsonb_object_agg(key, value), '{}') from jsonb_each(p_matches) where jsonb_array_length(value) > 0)
   where id = e.id;
end $$;
revoke execute on function public.save_season(bigint, date, jsonb, jsonb) from public, anon;
grant execute on function public.save_season(bigint, date, jsonb, jsonb) to authenticated;

-- Entering a card: in a season, only on a day the player has a match.
create or replace function public.enter_event_round(p_round bigint, p_event bigint, p_members bigint[], p_marker jsonb default null)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.rounds; e public.events; v_day int; m bigint;
begin
  select * into r from public.rounds where id = p_round;
  if r.id is null or not (r.created_by = public.current_member_id() or public.on_card(r.lineup)) then
    raise exception 'You can only count rounds from a card you''re on.' using errcode = '42501';
  end if;
  select * into e from public.events where id = p_event and style <> 'league' for update;
  if e.id is null then raise exception 'That event no longer exists.' using errcode = 'P0001'; end if;
  if exists (select 1 from jsonb_array_elements(r.done) d where d = 'true') then
    raise exception 'Rounds have to be counted before the first hole is saved.' using errcode = 'P0001';
  end if;
  v_day := r.date - e.start_date + 1;
  if v_day < 1 or v_day > e.days then raise exception 'The event isn''t on today.' using errcode = 'P0001'; end if;
  if p_marker is not null then
    if not (r.lineup @> jsonb_build_array(p_marker)) or (p_marker ? 'm' and (p_marker->>'m')::bigint = any (p_members)) then
      raise exception 'Your marker has to be someone else on this card.' using errcode = 'P0001';
    end if;
  end if;
  foreach m in array p_members loop
    if not m = any (e.players) then raise exception '% isn''t in this event.', (select name from public.members where id = m) using errcode = 'P0001'; end if;
    if e.season and not exists (select 1 from jsonb_array_elements(coalesce(e.matches->(v_day::text), '[]')) mt
                                 where mt->'a' @> to_jsonb(m) or mt->'b' @> to_jsonb(m)) then
      raise exception '% has no match on this day.', (select name from public.members where id = m) using errcode = 'P0001';
    end if;
    if not exists (select 1 from jsonb_array_elements(r.lineup) x where (x->>'m')::bigint = m) then
      raise exception 'One of those players isn''t on this card.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.event_entries where event_id = e.id and day = v_day and member_id = m and round_id <> r.id) then
      raise exception '% is already counting another card for this event today.', (select name from public.members where id = m) using errcode = 'P0001';
    end if;
    insert into public.event_entries (event_id, day, member_id, round_id, marker) values (e.id, v_day, m, r.id, p_marker)
      on conflict (event_id, day, member_id) do update set marker = excluded.marker where public.event_entries.round_id = excluded.round_id;
  end loop;
  return v_day;
end $function$;
