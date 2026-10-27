-- A league entry is final: once a player is entered for a week, that's their go. Deleting the card (or a booking
-- taking its card with it) keeps the entry, with no card, so they can't enter another round that week; leaving is
-- for the club office only. The office takes a player out of the week (office_take_out_league) to give them another
-- go, or deletes an unneeded card with its entries.

alter table public.league_entries alter column round_id drop not null;
alter table public.league_entries drop constraint league_entries_round_id_fkey;
alter table public.league_entries add constraint league_entries_round_id_fkey foreign key (round_id) references public.rounds on delete set null;

create or replace function public.enter_league(p_round bigint, p_event bigint, p_members bigint[], p_marker jsonb default null) returns integer
language plpgsql security definer set search_path to '' as $$
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
    -- another card this week, or one since deleted (no card): their go is used
    if exists (select 1 from public.league_entries where event_id = e.id and week = v_week and member_id = m and round_id is distinct from r.id) then
      raise exception '% has already entered a round this week. The club office can give them another go.', (select name from public.members where id = m) using errcode = 'P0001';
    end if;
    insert into public.league_entries (event_id, week, member_id, round_id, marker) values (e.id, v_week, m, r.id, p_marker)
      on conflict (event_id, week, member_id) do update set marker = excluded.marker where public.league_entries.round_id = excluded.round_id;
  end loop;
  return v_week;
end $$;

-- Leaving a league week: the club office only (players are committed once entered).
create or replace function public.leave_league(p_round bigint, p_event bigint, p_members bigint[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Once you''re entered, that''s your round for the week. Ask the club office if it needs to change.' using errcode = 'P0001';
  end if;
  delete from public.league_entries where round_id = p_round and event_id = p_event and member_id = any(p_members);
end $$;

-- The office deletes a card nobody needs: its league entries go too (giving those players their go back).
create or replace function public.office_delete_league_card(p_round bigint) returns void
language plpgsql security definer set search_path to '' as $$
declare r public.rounds;
begin
  if not public.is_admin() then raise exception 'Only the club office can delete a player''s card.' using errcode = '42501'; end if;
  select * into r from public.rounds where id = p_round for update;
  if not found then raise exception 'That card has already gone.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.league_entries where round_id = p_round) then
    raise exception 'Only league cards can be deleted here.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from jsonb_array_elements(r.done) d where d = 'false') then
    raise exception 'That card is finished. Take a player out of the week instead.' using errcode = 'P0001';
  end if;
  delete from public.league_entries where round_id = p_round;
  delete from public.rounds where id = p_round;
end $$;
