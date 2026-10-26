-- Points and match day settings are checked on every save (one-offs, seasons before they start, admins), not just
-- through save_season, with plain messages: points are numbers from 0 to 10 in halves, for the four match types;
-- a day's settings are for a match day in the event, holes from the list.

create function public.points_problem(p jsonb) returns text
language plpgsql immutable set search_path to '' as $$
declare pt record;
begin
  if p is null then return null; end if;
  if jsonb_typeof(p) <> 'object' then return 'Match points are from 0 to 10, in halves.'; end if;
  for pt in select key, value from jsonb_each(p) loop
    if pt.key not in ('four', 'singles', 'threePair', 'threeSingle') then return 'Match points are for four-balls, singles and 3-balls only.'; end if;
    if jsonb_typeof(pt.value) <> 'number' or pt.value::numeric not between 0 and 10 or pt.value::numeric * 2 <> floor(pt.value::numeric * 2) then
      return 'Match points are from 0 to 10, in halves.';
    end if;
  end loop;
  return null;
end $$;

-- The event's points and each match day's settings (a day number in the event; holes from the list; points as above).
create function public.match_rules_problem(p_points jsonb, p_day_rules jsonb, p_days int) returns text
language plpgsql immutable set search_path to '' as $$
declare d record; v_problem text;
begin
  v_problem := public.points_problem(p_points);
  if v_problem is not null then return v_problem; end if;
  if p_day_rules is null then return null; end if;
  if jsonb_typeof(p_day_rules) <> 'object' then return 'A match day has holes and points only.'; end if;
  for d in select key, value from jsonb_each(p_day_rules) loop
    if d.key !~ '^[0-9]+$' or d.key::int < 1 or (p_days is not null and d.key::int > p_days) then
      return 'Those settings aren''t for a match day in this event.';
    end if;
    if jsonb_typeof(d.value) <> 'object' or exists (select 1 from jsonb_object_keys(d.value) x where x not in ('holes', 'points')) then
      return 'A match day has holes and points only.';
    end if;
    if d.value ? 'holes' and (jsonb_typeof(d.value->'holes') <> 'number' or (d.value->>'holes') not in ('18', '14', '12', '9', '6')) then
      return 'A match day is 18, 14, 12, 9 or 6 holes.';
    end if;
    v_problem := public.points_problem(d.value->'points');
    if v_problem is not null then return v_problem; end if;
  end loop;
  return null;
end $$;

alter table public.events add constraint event_match_rules check (public.match_rules_problem(points, day_rules, days) is null);

create or replace function public.save_season(p_event bigint, p_end date, p_team jsonb, p_matches jsonb, p_day_rules jsonb default null) returns void
language plpgsql security definer set search_path to '' as $$
declare v_problem text; e public.events; v_days int; d text; m jsonb; ids bigint[]; x bigint; k text; v_day int; seen bigint[];
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
    if public.season_day_started(e.id, v_day) and (coalesce(e.matches->d, '[]') is distinct from coalesce(p_matches->d, '[]')
        or e.day_rules->d is distinct from coalesce(p_day_rules, e.day_rules)->d) then
      raise exception 'That match day has started; its matches can''t change.' using errcode = 'P0001';
    end if;
  end loop;
  for d in select jsonb_object_keys(e.matches) loop
    if public.season_day_started(e.id, d::int) then
      for x in select p::text::bigint from jsonb_array_elements(e.matches->d) mt, jsonb_array_elements((mt->'a') || (mt->'b')) p loop
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
      if (jsonb_array_length(m->'a'), jsonb_array_length(m->'b')) not in ((2, 2), (1, 1), (2, 1), (1, 2)) then
        raise exception 'A match is a four-ball (2 v 2), a singles (1 v 1) or a 3-ball (2 v 1).' using errcode = 'P0001';
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
  v_problem := public.match_rules_problem(null, p_day_rules, v_days);
  if v_problem is not null then raise exception '%', v_problem using errcode = 'P0001'; end if;

  update public.events set day_rules = coalesce(p_day_rules, day_rules), days = v_days, team = p_team, players = ids,
    matches = (select coalesce(jsonb_object_agg(key, value), '{}') from jsonb_each(p_matches) where jsonb_array_length(value) > 0)
   where id = e.id;
end $$;
