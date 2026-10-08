-- Counter-offers: a group answering an invitation can suggest a different game and teams instead.
-- The latest version is "on the table": proposer_slot is the group that put it there (the host at
-- first). Every other group then has to accept it, the host's group included; any earlier
-- acceptances reset. Any group except the latest proposer can accept, decline or counter again.

alter table public.player_events
  add column proposer_slot bigint references public.tee_slots on delete set null,
  add column proposed_by bigint references public.members on delete set null;
update public.player_events e set proposer_slot = (select slot_id from public.player_event_groups g where g.event_id = e.id and g.host), proposed_by = created_by;

-- Check an event set-up for these groups and snapshot the players: { "names": ..., "players": [...] }.
-- Used when an event is proposed and when a group suggests changes.
create function public.player_event_setup(v_slots bigint[], p_style text, p_format text, p_team_names jsonb, p_teams jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_players jsonb; v_names jsonb; s bigint; n int;
begin
  foreach s in array v_slots loop
    select count(*) into n from public.slot_players(s);
    if n < 2 then
      raise exception 'Every group needs at least two players.' using errcode = 'P0001';
    end if;
    if p_style = 'ryder' and n <> 4 then
      raise exception 'Ryder Cup needs full four-balls.' using errcode = 'P0001';
    end if;
  end loop;

  if p_style = 'fourball' then
    if p_format = 'bestball' and cardinality(v_slots) <> 2 then
      raise exception 'Match play needs exactly two groups.' using errcode = 'P0001';
    end if;
    -- each group is a team, named after its tee time unless given a name
    select jsonb_object_agg(t.id::text, coalesce(nullif(trim(p_team_names->>(t.id::text)), ''), to_char(make_time(t.start_time / 60, t.start_time % 60, 0), 'HH24:MI')))
      into v_names from public.tee_slots t where t.id = any(v_slots);
  elsif p_style in ('ryder', 'teams') then
    if coalesce(trim(p_team_names->>'A'), '') = '' or coalesce(trim(p_team_names->>'B'), '') = '' then
      raise exception 'Give both teams a name.' using errcode = 'P0001';
    end if;
    v_names := jsonb_build_object('A', trim(p_team_names->>'A'), 'B', trim(p_team_names->>'B'));
    if exists (select 1 from unnest(v_slots) s2, public.slot_players(s2) p where coalesce(p_teams->>(p.id::text), '') not in ('A', 'B')) then
      raise exception 'Put every player on a team.' using errcode = 'P0001';
    end if;
    if p_style = 'ryder' and exists (select 1 from unnest(v_slots) s2
         where (select count(*) from public.slot_players(s2) p where p_teams->>(p.id::text) = 'A') <> 2) then
      raise exception 'Each four-ball needs two players on each team.' using errcode = 'P0001';
    end if;
    if p_style = 'teams' and (select count(*) filter (where p_teams->>(p.id::text) = 'A') - count(*) filter (where p_teams->>(p.id::text) = 'B')
                                from unnest(v_slots) s2, public.slot_players(s2) p) <> 0 then
      raise exception 'The two teams need the same number of players.' using errcode = 'P0001';
    end if;
  else
    raise exception 'Pick a team style.' using errcode = 'P0001';
  end if;

  select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'memberId', p.member_id, 'guest', p.guest, 'slot', s2,
           'team', case when p_style = 'fourball' then s2::text else p_teams->>(p.id::text) end) order by t.start_time, p.id)
    into v_players
    from unnest(v_slots) s2 join public.tee_slots t on t.id = s2, public.slot_players(s2) p;

  return jsonb_build_object('names', v_names, 'players', v_players);
end $$;
revoke execute on function public.player_event_setup(bigint[], text, text, jsonb, jsonb) from public, anon;

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
              where g.slot_id = any(v_slots) and e.status in ('pending', 'accepted')) then
    raise exception 'One of those groups is already in an event.' using errcode = 'P0001';
  end if;
  v_setup := public.player_event_setup(v_slots, p_style, p_format, p_team_names, p_teams);
  v_names := v_setup->'names'; v_players := v_setup->'players';
  insert into public.player_events (date, created_by, style, format, team_names, players, proposer_slot, proposed_by)
    values (v_date, v_me, p_style, p_format, v_names, v_players, p_host_slot, v_me) returning id into v_id;
  insert into public.player_event_groups (event_id, slot_id, host) select v_id, x, x = p_host_slot from unnest(v_slots) x;
  return v_id;
end $$;

-- Accept or decline the version on the table for my group (any group but the one that proposed it).
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
  if v_slot is null then
    raise exception 'Only a group that''s been asked can answer.' using errcode = '42501';
  end if;
  if e.status <> 'pending' or (select answer from public.player_event_groups where event_id = p_id and slot_id = v_slot) is not null then
    raise exception 'That invitation has already been answered or cancelled.' using errcode = 'P0001';
  end if;
  if p_accept then
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

-- Suggest a different game and/or teams. It becomes the version on the table, from my group.
create function public.counter_player_event(p_id bigint, p_style text, p_format text, p_team_names jsonb default '{}', p_teams jsonb default '{}')
returns void
language plpgsql security definer set search_path = '' as $$
declare e public.player_events; v_slot bigint; v_slots bigint[]; v_now jsonb; v_setup jsonb;
begin
  select * into e from public.player_events where id = p_id for update;
  if not found then
    raise exception 'That event no longer exists.' using errcode = 'P0001';
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
revoke execute on function public.counter_player_event(bigint, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.counter_player_event(bigint, text, text, jsonb, jsonb) to authenticated;
