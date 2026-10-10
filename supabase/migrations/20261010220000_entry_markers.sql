-- Who marks a card that counts for a league or a standard competition: anyone else on the card ({m} or {g}).
-- Stored with each entry (part 3 uses it to confirm the score). No marker is still accepted (matches, older apps).

alter table public.league_entries add column marker jsonb;
alter table public.event_entries add column marker jsonb;

drop function public.enter_league(bigint, bigint, bigint[]);
create function public.enter_league(p_round bigint, p_event bigint, p_members bigint[], p_marker jsonb default null)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.rounds; e public.events; v_week int; m bigint;
begin
  select * into r from public.rounds where id = p_round;
  if r.id is null or not (r.created_by = public.current_member_id() or public.on_card(r.lineup)) then
    raise exception 'You can only enter rounds from a card you''re on.' using errcode = '42501';
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
  if p_marker is not null then
    if not (r.lineup @> jsonb_build_array(p_marker)) or (p_marker ? 'm' and (p_marker->>'m')::bigint = any (p_members)) then
      raise exception 'Your marker has to be someone else on this card.' using errcode = 'P0001';
    end if;
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
    insert into public.league_entries (event_id, week, member_id, round_id, marker) values (e.id, v_week, m, r.id, p_marker)
      on conflict (event_id, week, member_id) do update set marker = excluded.marker where public.league_entries.round_id = excluded.round_id;
  end loop;
  return v_week;
end $function$;
revoke execute on function public.enter_league(bigint, bigint, bigint[], jsonb) from public, anon;
grant execute on function public.enter_league(bigint, bigint, bigint[], jsonb) to authenticated;

drop function public.enter_event_round(bigint, bigint, bigint[]);
create function public.enter_event_round(p_round bigint, p_event bigint, p_members bigint[], p_marker jsonb default null)
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
revoke execute on function public.enter_event_round(bigint, bigint, bigint[], jsonb) from public, anon;
grant execute on function public.enter_event_round(bigint, bigint, bigint[], jsonb) to authenticated;
