-- Found by the ripple tests: deleting a member left them in events' player lists, teams, captain candidates and
-- league team captaincies (those are lists inside the event, not links the database tidies itself). Now any deletion
-- takes them off every event first, exactly as withdrawing does. Their scores on other people's cards stay as history.

create function public.members_take_off_events() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_ev bigint;
begin
  for v_ev in
    select id from public.events
     where old.id = any (players) or team ? old.id::text or old.id = any (coalesce(captain_pool, '{}'))
        or exists (select 1 from jsonb_array_elements(coalesce(league_teams, '[]')) x where (x->>'captain')::bigint = old.id)
  loop
    perform public.take_off_event(v_ev, old.id);
  end loop;
  return old;
end $$;
revoke execute on function public.members_take_off_events() from public, anon, authenticated;
create trigger members_take_off_events before delete on public.members for each row execute function public.members_take_off_events();
