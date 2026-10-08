-- Player events with any number of groups. The proposer's group hosts; every invited group must
-- accept (one member from each) before the event starts; one decline and it doesn't go ahead.
--
-- style  'fourball' = four-ball v four-ball: each group is its own team (no team picking)
--                     formats: 'best2' | 'all4' (Stableford), 'bestball' (match play, exactly two groups)
--        'ryder'    = two teams, two from each team in every four-ball; each four-ball plays a
--                     better-ball match worth 1 point. formats: 'bbl' | 'bbstab' | 'bbscr'
--        'teams'    = two teams of equal size picked freely; everyone's Stableford counts. format: 'teamstab'
-- team_names: fourball → { "<slot id>": "08:10", ... }; ryder/teams → { "A": "...", "B": "..." }
-- players snapshot: [{ id, name, memberId, guest, slot, team }]  (team: slot id for fourball, 'A'/'B' otherwise)

create table public.player_event_groups (
  event_id bigint not null references public.player_events on delete cascade,
  slot_id bigint not null references public.tee_slots on delete cascade,
  host boolean not null default false,
  answer text check (answer in ('accepted', 'declined')),
  answered_by bigint references public.members on delete set null,
  answered_at timestamptz,
  primary key (event_id, slot_id)
);
create index on public.player_event_groups (slot_id);

-- Move existing events across (host = slot_a, invited = slot_b).
insert into public.player_event_groups (event_id, slot_id, host, answer, answered_by, answered_at)
  select id, slot_a, true, null, null, null from public.player_events
  union all
  select id, slot_b, false, case when status in ('accepted', 'declined') then status end, responded_by, responded_at from public.player_events;
update public.player_events e set
  players = (select jsonb_agg((x - 'group') || jsonb_build_object(
               'slot', case x->>'group' when 'A' then e.slot_a else e.slot_b end,
               'team', case when e.style = 'fourball' then to_jsonb((case x->>'team' when 'A' then e.slot_a else e.slot_b end)::text) else x->'team' end))
             from jsonb_array_elements(e.players) x),
  team_names = case when e.style = 'fourball' then jsonb_build_object(e.slot_a::text, e.team_names->>'A', e.slot_b::text, e.team_names->>'B') else e.team_names end;

drop policy "players on either tee time, or admins" on public.player_events;
alter table public.player_events drop constraint player_events_check1;
alter table public.player_events drop column slot_a, drop column slot_b, drop column responded_by, drop column responded_at;
alter table public.player_events add constraint style_format check (
  (style = 'fourball' and format in ('best2', 'all4', 'bestball')) or
  (style = 'ryder' and format in ('bbl', 'bbstab', 'bbscr')) or
  (style = 'teams' and format = 'teamstab'));
alter table public.player_events drop constraint player_events_style_check;
alter table public.player_events add constraint player_events_style_check check (style in ('fourball', 'ryder', 'teams'));

-- Is the signed-in member on one of this event's tee times?
create function public.in_player_event(p_event bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.player_event_groups g join public.booking_players bp on bp.slot_id = g.slot_id
                  where g.event_id = p_event and bp.member_id = public.current_member_id())
$$;
grant execute on function public.in_player_event(bigint) to authenticated;
revoke execute on function public.in_player_event(bigint) from public, anon;

create policy "players in the event, or admins" on public.player_events for select to authenticated
  using (public.is_admin() or public.in_player_event(id));
alter table public.player_event_groups enable row level security;
revoke all on public.player_event_groups from anon, authenticated;
grant select on public.player_event_groups to authenticated;
create policy "players in the event, or admins" on public.player_event_groups for select to authenticated
  using (public.is_admin() or public.in_player_event(event_id));

drop function public.create_player_event(bigint, bigint, text, text, jsonb, jsonb);
drop function public.respond_player_event(bigint, boolean);

-- Propose an event from my tee time to one or more other groups the same day.
-- p_teams (ryder/teams): { "<booking player id>": "A" | "B" }. p_team_names: see above (fourball names default to tee times).
create function public.create_player_event(
  p_host_slot bigint, p_invited bigint[], p_style text, p_format text, p_team_names jsonb default '{}', p_teams jsonb default '{}'
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_me bigint := public.current_member_id();
  v_slots bigint[] := array[p_host_slot] || coalesce(p_invited, '{}');
  v_date date; v_players jsonb; v_names jsonb; v_id bigint; s bigint; n int;
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

  insert into public.player_events (date, created_by, style, format, team_names, players)
    values (v_date, v_me, p_style, p_format, v_names, v_players) returning id into v_id;
  insert into public.player_event_groups (event_id, slot_id, host) select v_id, x, x = p_host_slot from unnest(v_slots) x;
  return v_id;
end $$;

-- Accept or decline for my group. The event starts when every invited group has accepted.
create function public.respond_player_event(p_id bigint, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.player_events; v_slot bigint; v_now jsonb;
begin
  select * into e from public.player_events where id = p_id for update;
  if not found then
    raise exception 'That event no longer exists.' using errcode = 'P0001';
  end if;
  select g.slot_id into v_slot from public.player_event_groups g join public.booking_players bp on bp.slot_id = g.slot_id
   where g.event_id = p_id and not g.host and bp.member_id = public.current_member_id() limit 1;
  if v_slot is null then
    raise exception 'Only an invited group can answer.' using errcode = '42501';
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
  elsif not exists (select 1 from public.player_event_groups where event_id = p_id and not host and answer is distinct from 'accepted') then
    update public.player_events set status = 'accepted' where id = p_id;
  end if;
end $$;

revoke execute on function public.create_player_event(bigint, bigint[], text, text, jsonb, jsonb), public.respond_player_event(bigint, boolean) from public, anon;
grant execute on function public.create_player_event(bigint, bigint[], text, text, jsonb, jsonb), public.respond_player_event(bigint, boolean) to authenticated;
