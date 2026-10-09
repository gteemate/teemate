-- Events count only the cards ticked for them ("Scoring round?"), like leagues. entry_required marks an event
-- that works this way: the app sets it on every event it creates from now on. Existing events keep counting
-- every card (off), so no result already shown can change, and an event made by an older copy of the app
-- still scores. Matches between groups are separate (player_events).

alter table public.events add column entry_required boolean not null default false;

create table public.event_entries (
  event_id bigint not null references public.events (id) on delete cascade,
  day int not null check (day >= 1),
  member_id bigint not null references public.members (id) on delete cascade,
  round_id bigint not null references public.rounds (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, day, member_id)
);
alter table public.event_entries enable row level security;
create policy "members read event entries" on public.event_entries for select to authenticated using (public.current_member_id() is not null);

-- Tick: these players on this card count it for the event today (before hole 1 is saved). Returns the event day.
create function public.enter_event_round(p_round bigint, p_event bigint, p_members bigint[]) returns int
language plpgsql security definer set search_path = '' as $$
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
  foreach m in array p_members loop
    if not m = any (e.players) then raise exception '% isn''t in this event.', (select name from public.members where id = m) using errcode = 'P0001'; end if;
    if not exists (select 1 from jsonb_array_elements(r.lineup) x where (x->>'m')::bigint = m) then
      raise exception 'One of those players isn''t on this card.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.event_entries where event_id = e.id and day = v_day and member_id = m and round_id <> r.id) then
      raise exception '% is already counting another card for this event today.', (select name from public.members where id = m) using errcode = 'P0001';
    end if;
    insert into public.event_entries (event_id, day, member_id, round_id) values (e.id, v_day, m, r.id) on conflict do nothing;
  end loop;
  return v_day;
end $$;

-- Untick (before hole 1 is saved).
create function public.leave_event_round(p_round bigint, p_event bigint, p_members bigint[]) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.rounds;
begin
  select * into r from public.rounds where id = p_round;
  if r.id is null or not (r.created_by = public.current_member_id() or public.on_card(r.lineup)) then
    raise exception 'You can only change rounds from a card you''re on.' using errcode = '42501';
  end if;
  if exists (select 1 from jsonb_array_elements(r.done) d where d = 'true') then
    raise exception 'Rounds can only be changed before the first hole is saved.' using errcode = 'P0001';
  end if;
  delete from public.event_entries where event_id = p_event and round_id = r.id and member_id = any (p_members);
end $$;

revoke execute on function public.enter_event_round(bigint, bigint, bigint[]), public.leave_event_round(bigint, bigint, bigint[]) from public, anon;
grant execute on function public.enter_event_round(bigint, bigint, bigint[]), public.leave_event_round(bigint, bigint, bigint[]) to authenticated;
