-- One against one with a player in another group today: you challenge them, they accept (only them, not their group),
-- and each of you scores on your own group's card; the match is worked out from both cards (handicap match play,
-- Stableford match play or scratch). A one-on-one doesn't stop either group joining a four-ball challenge.

alter table public.player_events drop constraint player_events_style_check;
alter table public.player_events add constraint player_events_style_check check (style in ('fourball', 'ryder', 'teams', 'singles'));
alter table public.player_events drop constraint style_format;
alter table public.player_events add constraint style_format check (
  (style = 'fourball' and format in ('best2', 'all4', 'bestball')) or (style = 'ryder' and format in ('bbl', 'bbstab', 'bbscr'))
  or (style = 'teams' and format = 'teamstab') or (style = 'singles' and format in ('kos', 'sm2', 'sc2')));

-- Challenge one player (their booking) in another group the same day, from my tee time. → the event's id
create or replace function public.create_singles_match(p_my_slot bigint, p_opponent bigint, p_game text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_me bigint := public.current_member_id();
  mine public.booking_players; theirs public.booking_players; v_date date; v_id bigint;
begin
  select * into mine from public.booking_players where slot_id = p_my_slot and member_id = v_me;
  if not found then raise exception 'You can only challenge someone from your own tee time.' using errcode = '42501'; end if;
  select * into theirs from public.booking_players where id = p_opponent;
  if not found or theirs.member_id is null then raise exception 'Pick a member to play against.' using errcode = 'P0001'; end if;
  if theirs.slot_id = p_my_slot then raise exception 'They''re on your card: add the one-on-one there instead.' using errcode = 'P0001'; end if;
  if p_game not in ('kos', 'sm2', 'sc2') then raise exception 'Pick a match play game.' using errcode = 'P0001'; end if;
  select date into v_date from public.tee_slots where id = p_my_slot;
  if v_date <> (select date from public.tee_slots where id = theirs.slot_id) then raise exception 'You''re not playing on the same day.' using errcode = 'P0001'; end if;
  if v_date < current_date then raise exception 'That day has passed.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.player_events e where e.style = 'singles' and e.status in ('pending', 'accepted') and e.date = v_date
               and e.players @> jsonb_build_array(jsonb_build_object('memberId', v_me)) and e.players @> jsonb_build_array(jsonb_build_object('memberId', theirs.member_id))) then
    raise exception 'You already have a one-on-one with them today.' using errcode = 'P0001';
  end if;
  insert into public.player_events (date, created_by, style, format, team_names, players, proposer_slot, proposed_by)
  values (v_date, v_me, 'singles', p_game,
    jsonb_build_object('A', (select name from public.members where id = v_me), 'B', (select name from public.members where id = theirs.member_id)),
    jsonb_build_array(
      jsonb_build_object('id', mine.id, 'name', (select name from public.members where id = v_me), 'memberId', v_me, 'guest', false, 'slot', p_my_slot, 'team', 'A'),
      jsonb_build_object('id', theirs.id, 'name', (select name from public.members where id = theirs.member_id), 'memberId', theirs.member_id, 'guest', false, 'slot', theirs.slot_id, 'team', 'B')),
    p_my_slot, v_me)
  returning id into v_id;
  insert into public.player_event_groups (event_id, slot_id, host) values (v_id, p_my_slot, true), (v_id, theirs.slot_id, false);
  return v_id;
end $$;
revoke execute on function public.create_singles_match(bigint, bigint, text) from public, anon;
grant execute on function public.create_singles_match(bigint, bigint, text) to authenticated;

create or replace function public.create_player_event(
  p_host_slot bigint, p_invited bigint[], p_style text, p_format text, p_team_names jsonb default '{}', p_teams jsonb default '{}'
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_me bigint := public.current_member_id();
  v_slots bigint[] := array[p_host_slot] || coalesce(p_invited, '{}');
  v_date date; v_players jsonb; v_names jsonb; v_id bigint; s bigint; v_setup jsonb;
begin
  if not exists (select 1 from public.booking_players where slot_id = p_host_slot and member_id = v_me) then
    raise exception 'You can only start an event from your own tee time.' using errcode = '42501';
  end if;
  if cardinality(coalesce(p_invited, '{}')) = 0 then
    raise exception 'Pick at least one other group.' using errcode = 'P0001';
  end if;
  if (select count(distinct x) from unnest(v_slots) x) <> cardinality(v_slots) then
    raise exception 'A group is listed twice.' using errcode = 'P0001';
  end if;
  if (select count(distinct date) from public.tee_slots where id = any(v_slots)) <> 1
     or (select count(*) from public.tee_slots where id = any(v_slots)) <> cardinality(v_slots) then
    raise exception 'All the groups must be on the same day.' using errcode = 'P0001';
  end if;
  select date into v_date from public.tee_slots where id = p_host_slot;
  if v_date < current_date then
    raise exception 'That day has passed.' using errcode = 'P0001';
  end if;
  foreach s in array p_invited loop
    if not exists (select 1 from public.booking_players where slot_id = s and member_id is not null) then
      raise exception 'Every invited group needs a member to accept.' using errcode = 'P0001';
    end if;
  end loop;
  if exists (select 1 from public.player_event_groups g join public.player_events e on e.id = g.event_id
              where g.slot_id = any(v_slots) and e.status in ('pending', 'accepted') and e.style <> 'singles') then
    raise exception 'One of those groups is already in an event.' using errcode = 'P0001';
  end if;
  v_setup := public.player_event_setup(v_slots, p_style, p_format, p_team_names, p_teams);
  v_names := v_setup->'names'; v_players := v_setup->'players';
  insert into public.player_events (date, created_by, style, format, team_names, players, proposer_slot, proposed_by)
    values (v_date, v_me, p_style, p_format, v_names, v_players, p_host_slot, v_me) returning id into v_id;
  insert into public.player_event_groups (event_id, slot_id, host) select v_id, x, x = p_host_slot from unnest(v_slots) x;
  return v_id;
end $$;

create or replace function public.respond_player_event(p_id bigint, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.player_events; v_slot bigint; v_now jsonb;
begin
  select * into e from public.player_events where id = p_id for update;
  if not found then
    raise exception 'That event no longer exists.' using errcode = 'P0001';
  end if;
  select g.slot_id into v_slot from public.player_event_groups g join public.booking_players bp on bp.slot_id = g.slot_id
   where g.event_id = p_id and g.slot_id is distinct from e.proposer_slot and bp.member_id = public.current_member_id() limit 1;
  if e.style = 'singles' and not exists (select 1 from jsonb_array_elements(e.players) x where x->>'team' = 'B' and (x->>'memberId')::bigint = public.current_member_id()) then
    v_slot := null; -- only the player challenged answers a one-on-one, not their group
  end if;
  if v_slot is null then
    raise exception 'Only a group that''s been asked can answer.' using errcode = '42501';
  end if;
  if e.status <> 'pending' or (select answer from public.player_event_groups where event_id = p_id and slot_id = v_slot) is not null then
    raise exception 'That invitation has already been answered or cancelled.' using errcode = 'P0001';
  end if;
  if p_accept and e.style = 'singles' then
    if (select count(*) from jsonb_array_elements(e.players) x join public.booking_players bp on bp.id = (x->>'id')::bigint and bp.slot_id = (x->>'slot')::bigint) <> 2 then
      raise exception 'One of you has moved tee time since this was sent. Ask for a new one.' using errcode = 'P0001';
    end if;
  elsif p_accept then
    select jsonb_agg(p.id order by p.id) into v_now
      from public.player_event_groups g, public.slot_players(g.slot_id) p where g.event_id = p_id;
    if v_now <> (select jsonb_agg((x->>'id')::bigint order by (x->>'id')::bigint) from jsonb_array_elements(e.players) x) then
      raise exception 'The groups have changed since this was proposed. Ask for a new invitation.' using errcode = 'P0001';
    end if;
  end if;
  update public.player_event_groups set answer = case when p_accept then 'accepted' else 'declined' end,
         answered_by = public.current_member_id(), answered_at = now()
   where event_id = p_id and slot_id = v_slot;
  if not p_accept then
    update public.player_events set status = 'declined' where id = p_id;
  elsif not exists (select 1 from public.player_event_groups where event_id = p_id and slot_id is distinct from e.proposer_slot and answer is distinct from 'accepted') then
    update public.player_events set status = 'accepted' where id = p_id;
  end if;
end $$;

create or replace function public.counter_player_event(p_id bigint, p_style text, p_format text, p_team_names jsonb default '{}', p_teams jsonb default '{}')
returns void
language plpgsql security definer set search_path = '' as $$
declare e public.player_events; v_slot bigint; v_slots bigint[]; v_now jsonb; v_setup jsonb;
begin
  select * into e from public.player_events where id = p_id for update;
  if not found then
    raise exception 'That event no longer exists.' using errcode = 'P0001';
  end if;
  if e.style = 'singles' then
    raise exception 'A one-on-one can''t be changed: decline it and ask for a new one.' using errcode = 'P0001';
  end if;
  select g.slot_id into v_slot from public.player_event_groups g join public.booking_players bp on bp.slot_id = g.slot_id
   where g.event_id = p_id and g.slot_id is distinct from e.proposer_slot and bp.member_id = public.current_member_id() limit 1;
  if v_slot is null then
    raise exception 'Only a group that''s been asked can suggest changes.' using errcode = '42501';
  end if;
  if e.status <> 'pending' then
    raise exception 'That event has already been agreed, declined or cancelled.' using errcode = 'P0001';
  end if;
  select jsonb_agg(p.id order by p.id), array_agg(distinct g.slot_id) into v_now, v_slots
    from public.player_event_groups g, public.slot_players(g.slot_id) p where g.event_id = p_id;
  if v_now <> (select jsonb_agg((x->>'id')::bigint order by (x->>'id')::bigint) from jsonb_array_elements(e.players) x) then
    raise exception 'The groups have changed since this was proposed. Ask for a new invitation.' using errcode = 'P0001';
  end if;
  v_setup := public.player_event_setup(v_slots, p_style, p_format, p_team_names, p_teams);
  update public.player_events set style = p_style, format = p_format, team_names = v_setup->'names', players = v_setup->'players',
         proposer_slot = v_slot, proposed_by = public.current_member_id()
   where id = p_id;
  update public.player_event_groups set answer = null, answered_by = null, answered_at = null where event_id = p_id;
end $$;
