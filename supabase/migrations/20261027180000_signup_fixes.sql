-- Sign-up fixes (found in review): entry dates go by the club's own date (UK time), as the app does, not the
-- server's (UTC: an hour behind in summer); members not in a sign-up event stop seeing it once entries close; on-the-day
-- entry (self_entry) is refused after the start as before, with its old withdraw message; an empty league team list
-- stays an empty list when someone is taken off.

create function public.club_today() returns date
language sql stable set search_path to '' as $$ select (now() at time zone 'Europe/London')::date $$;

drop policy "see all-member events, mine, ones I'm in, and ones open for entry" on public.events;
create policy "see all-member events, mine, ones I'm in, and ones open for entry" on public.events for select to authenticated
  using (everyone or public.is_admin() or created_by = public.current_member_id() or public.current_member_id() = any (players)
         or (club and self_entry and start_date > public.club_today())
         or (club and signup and coalesce(advertise_from, public.club_today()) <= public.club_today()
             and public.club_today() <= least(coalesce(entries_close, start_date - 1), start_date - 1)));

create or replace function public.enter_event(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me bigint := public.current_member_id(); e public.events; v_today date := public.club_today();
begin
  if v_me is null then raise exception 'Only members can enter competitions.' using errcode = '42501'; end if;
  select * into e from public.events where id = p_id for update; -- one at a time: two members can't take the last place
  if not found or not e.club or not (e.self_entry or e.signup) then raise exception 'This competition isn''t open for entry. Ask an admin to add you.' using errcode = 'P0001'; end if;
  if e.signup then
    if v_me = any (e.players) then return; end if;
    if e.advertise_from is not null and v_today < e.advertise_from then
      raise exception 'Entries open on %.', to_char(e.advertise_from, 'FMDay FMDD FMMonth') using errcode = 'P0001';
    end if;
    if v_today > public.entries_close_on(e) then raise exception 'Entries have closed.' using errcode = 'P0001'; end if;
    if e.max_entries is not null and cardinality(e.players) >= e.max_entries then
      raise exception 'Sorry, it''s full: someone took the last place.' using errcode = 'P0001';
    end if;
  else
    if e.start_date <= v_today then raise exception 'This competition has started, so entries are closed.' using errcode = 'P0001'; end if;
    if v_me = any (e.players) then return; end if;
  end if;
  update public.events set players = players || v_me where id = p_id;
end $$;

create or replace function public.withdraw_event(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me bigint := public.current_member_id(); e public.events; v_today date := public.club_today();
begin
  if v_me is null then raise exception 'Only members can withdraw from competitions.' using errcode = '42501'; end if;
  select * into e from public.events where id = p_id for update;
  if not found or not e.club or not (e.self_entry or e.signup) then raise exception 'This competition isn''t open for entry, so ask an admin to take you off.' using errcode = 'P0001'; end if;
  if e.signup and v_today > public.entries_close_on(e) then raise exception 'Entries have closed. Ask the club office to take you off.' using errcode = 'P0001'; end if;
  if not e.signup and e.start_date <= v_today then raise exception 'This competition has started. Ask an admin to take you off.' using errcode = 'P0001'; end if;
  perform public.take_off_event(p_id, v_me);
end $$;

create or replace function public.take_off_event(p_id bigint, p_member bigint) returns void
language sql security definer set search_path to '' as $$
  update public.events set
    players = array_remove(players, p_member),
    team = team - p_member::text,
    captain_pool = array_remove(captain_pool, p_member),
    league_teams = case when league_teams is null then null else coalesce(
      (select jsonb_agg(case when (t->>'captain')::bigint = p_member then t - 'captain' else t end order by o) from jsonb_array_elements(league_teams) with ordinality x(t, o)), '[]') end
  where id = p_id
$$;
revoke execute on function public.take_off_event(bigint, bigint) from public, anon, authenticated;
