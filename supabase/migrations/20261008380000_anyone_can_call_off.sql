-- Anyone playing in a player event (on one of its tee times) can call it off, not just the person
-- who proposed it. Everyone else in it sees "Off: Called off by <name>" on their Scores tab.
create or replace function public.cancel_player_event(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me bigint := public.current_member_id();
begin
  if not exists (select 1 from public.player_events where id = p_id
                  and (created_by = v_me or public.is_admin() or public.in_player_event(id))) then
    raise exception 'Only someone playing in it can call it off.' using errcode = '42501';
  end if;
  update public.player_events
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_me,
         cancel_note = 'Called off by ' || coalesce((select name from public.members where id = v_me), 'an admin')
   where id = p_id and status in ('pending', 'accepted');
end $$;
