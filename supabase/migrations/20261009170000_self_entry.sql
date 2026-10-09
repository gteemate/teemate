-- Members enter club competitions themselves. An admin marks a club competition "Members can enter"
-- (self_entry); until the day it starts, a member can enter or withdraw. Existing events: off.

alter table public.events add column self_entry boolean not null default false;

-- Members can also see club competitions open for entry (to enter them) before they start.
drop policy "see all-member events, mine, and ones I'm in" on public.events;
create policy "see all-member events, mine, ones I'm in, and ones open for entry" on public.events for select to authenticated
  using (everyone or public.is_admin() or created_by = public.current_member_id() or public.current_member_id() = any (players)
         or (club and self_entry and start_date > current_date));

create function public.enter_event(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me bigint := public.current_member_id(); e public.events;
begin
  if v_me is null then raise exception 'Only members can enter competitions.' using errcode = '42501'; end if;
  select * into e from public.events where id = p_id for update;
  if not found or not e.club or not e.self_entry then raise exception 'This competition isn''t open for entry. Ask an admin to add you.' using errcode = 'P0001'; end if;
  if e.start_date <= current_date then raise exception 'This competition has started, so entries are closed.' using errcode = 'P0001'; end if;
  if v_me = any (e.players) then return; end if;
  update public.events set players = players || v_me where id = p_id;
end $$;

create function public.withdraw_event(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me bigint := public.current_member_id(); e public.events;
begin
  if v_me is null then raise exception 'Only members can withdraw from competitions.' using errcode = '42501'; end if;
  select * into e from public.events where id = p_id for update;
  if not found or not e.club or not e.self_entry then raise exception 'This competition isn''t open for entry, so ask an admin to take you off.' using errcode = 'P0001'; end if;
  if e.start_date <= current_date then raise exception 'This competition has started. Ask an admin to take you off.' using errcode = 'P0001'; end if;
  update public.events set
    players = array_remove(players, v_me),
    team = team - v_me::text,
    captain_pool = array_remove(captain_pool, v_me),
    league_teams = case when league_teams is null then null else
      (select jsonb_agg(case when (t->>'captain')::bigint = v_me then t - 'captain' else t end order by o) from jsonb_array_elements(league_teams) with ordinality x(t, o)) end
  where id = p_id;
end $$;

revoke execute on function public.enter_event(bigint), public.withdraw_event(bigint) from public, anon;
grant execute on function public.enter_event(bigint), public.withdraw_event(bigint) to authenticated;
