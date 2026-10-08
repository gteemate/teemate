-- Players can delete their own scorecards. Deleting a booking also removes the booker's card started
-- from that tee time, if no holes have been saved on it yet (a card with scores is kept).

create policy "own rounds delete" on public.rounds for delete to authenticated using (created_by = public.current_member_id());
grant delete on public.rounds to authenticated;

create or replace function public.cancel_booking(p_booking bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me bigint := public.current_member_id(); b public.bookings; v_points int; v_cards int;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found then
    raise exception 'That booking no longer exists.' using errcode = 'P0001';
  end if;
  if b.booked_by = v_me then
    with g as (delete from public.guest_visits where booking_player_id in (select id from public.booking_players where booking_id = b.id) returning points)
    select coalesce(sum(points), 0) into v_points from g;
    delete from public.bookings where id = b.id;
    -- my card for that tee time, if nothing has been scored on it
    with c as (delete from public.rounds r where r.slot_id = b.slot_id and r.created_by = v_me
                 and not exists (select 1 from jsonb_array_elements(r.done) d where d = 'true') returning 1)
    select count(*) into v_cards from c;
    return jsonb_build_object('result', 'deleted', 'pointsBack', v_points, 'cardsRemoved', v_cards);
  end if;
  if exists (select 1 from public.booking_players where booking_id = b.id and member_id = v_me) then
    delete from public.booking_players where booking_id = b.id and member_id = v_me;
    return jsonb_build_object('result', 'withdrawn', 'pointsBack', 0, 'cardsRemoved', 0);
  end if;
  raise exception 'That isn''t your booking.' using errcode = '42501';
end $$;
