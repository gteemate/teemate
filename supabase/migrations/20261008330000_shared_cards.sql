-- One card per group: everyone on a card can save holes, change the game or pairs, and answer the
-- league question for it, not just whoever started it. Only the starter can delete it.

create function public.on_card(p_lineup jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_lineup @> jsonb_build_array(jsonb_build_object('m', public.current_member_id()))
$$;
revoke execute on function public.on_card(jsonb) from public, anon;
grant execute on function public.on_card(jsonb) to authenticated;

drop policy "own rounds update" on public.rounds;
create policy "card players update" on public.rounds for update to authenticated
  using (created_by = public.current_member_id() or public.on_card(lineup))
  with check (created_by = public.current_member_id() or public.on_card(lineup));

create index rounds_lineup_idx on public.rounds using gin (lineup jsonb_path_ops);

create or replace function public.enter_league(p_round bigint, p_event bigint, p_members bigint[]) returns int
language plpgsql security definer set search_path = '' as $$
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

create or replace function public.leave_league(p_round bigint, p_event bigint, p_members bigint[]) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.rounds;
begin
  select * into r from public.rounds where id = p_round;
  if r.id is null or not (r.created_by = public.current_member_id() or public.on_card(r.lineup)) then
    raise exception 'You can only change entries on a card you''re on.' using errcode = '42501';
  end if;
  if exists (select 1 from jsonb_array_elements(r.done) d where d = 'true') then
    raise exception 'Entries are locked once the first hole is saved.' using errcode = 'P0001';
  end if;
  delete from public.league_entries where round_id = r.id and event_id = p_event and member_id = any(p_members);
end $$;
