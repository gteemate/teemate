-- Leagues and club events open for sign-up: the club office advertises one from a date, with a closing date and a
-- number of places. Members enter until entries close or it's full; a withdraw opens a place again. The limit stops
-- members, not the office (it can still add players itself). On-the-day joining (self_entry) is unchanged.

alter table public.events add column signup boolean not null default false;
alter table public.events add column advertise_from date;
alter table public.events add column entries_close date;
alter table public.events add column max_entries int check (max_entries is null or max_entries >= 1);
alter table public.events add constraint event_signup_dates check (
  (entries_close is null or entries_close < start_date)
  and (advertise_from is null or advertise_from <= coalesce(entries_close, start_date - 1)));
grant select (signup, advertise_from, entries_close, max_entries) on public.events to authenticated;

-- The last day members can enter: the closing date, else the day before the first day.
create function public.entries_close_on(e public.events) returns date
language sql immutable set search_path to '' as $$ select least(coalesce(e.entries_close, e.start_date - 1), e.start_date - 1) $$;

drop policy "see all-member events, mine, ones I'm in, and ones open for entry" on public.events;
create policy "see all-member events, mine, ones I'm in, and ones open for entry" on public.events for select to authenticated
  using (everyone or public.is_admin() or created_by = public.current_member_id() or public.current_member_id() = any (players)
         or (club and self_entry and start_date > current_date)
         or (club and signup and coalesce(advertise_from, current_date) <= current_date and start_date > current_date));

create or replace function public.enter_event(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me bigint := public.current_member_id(); e public.events;
begin
  if v_me is null then raise exception 'Only members can enter competitions.' using errcode = '42501'; end if;
  select * into e from public.events where id = p_id for update; -- one at a time: two members can't take the last place
  if not found or not e.club or not (e.self_entry or e.signup) then raise exception 'This competition isn''t open for entry. Ask an admin to add you.' using errcode = 'P0001'; end if;
  if v_me = any (e.players) then return; end if;
  if e.signup then
    if e.advertise_from is not null and current_date < e.advertise_from then
      raise exception 'Entries open on %.', to_char(e.advertise_from, 'FMDay FMDD FMMonth') using errcode = 'P0001';
    end if;
    if current_date > public.entries_close_on(e) then raise exception 'Entries have closed.' using errcode = 'P0001'; end if;
    if e.max_entries is not null and cardinality(e.players) >= e.max_entries then
      raise exception 'Sorry, it''s full: someone took the last place.' using errcode = 'P0001';
    end if;
  elsif e.start_date <= current_date then
    raise exception 'This competition has started, so entries are closed.' using errcode = 'P0001';
  end if;
  update public.events set players = players || v_me where id = p_id;
end $$;

-- Take a member off an event (and its teams, captains): the member themselves until entries close, or the office.
create function public.take_off_event(p_id bigint, p_member bigint) returns void
language sql security definer set search_path to '' as $$
  update public.events set
    players = array_remove(players, p_member),
    team = team - p_member::text,
    captain_pool = array_remove(captain_pool, p_member),
    league_teams = case when league_teams is null then null else
      (select jsonb_agg(case when (t->>'captain')::bigint = p_member then t - 'captain' else t end order by o) from jsonb_array_elements(league_teams) with ordinality x(t, o)) end
  where id = p_id
$$;
revoke execute on function public.take_off_event(bigint, bigint) from public, anon, authenticated;

create or replace function public.withdraw_event(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me bigint := public.current_member_id(); e public.events;
begin
  if v_me is null then raise exception 'Only members can withdraw from competitions.' using errcode = '42501'; end if;
  select * into e from public.events where id = p_id for update;
  if not found or not e.club or not (e.self_entry or e.signup) then raise exception 'This competition isn''t open for entry, so ask an admin to take you off.' using errcode = 'P0001'; end if;
  if (e.signup and current_date > public.entries_close_on(e)) or (not e.signup and e.start_date <= current_date) then
    raise exception 'Entries have closed. Ask the club office to take you off.' using errcode = 'P0001';
  end if;
  perform public.take_off_event(p_id, v_me);
end $$;

create function public.remove_event_entrant(p_event bigint, p_member bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only the club office can take someone off.' using errcode = '42501'; end if;
  perform public.take_off_event(p_event, p_member);
end $$;
revoke execute on function public.remove_event_entrant(bigint, bigint) from public, anon;
grant execute on function public.remove_event_entrant(bigint, bigint) to authenticated;
