-- Rearrange a match: move a booking of members only (no guests) to another tee time on the same day, in one step.
-- Anyone on the booking can do it (the match's players arranging among themselves); it stays booked by whoever
-- made it. The old booking goes (with any unscored card for it) and the new one is made through book_as, so the
-- usual rules apply (room, the 2-hour gap, tee times open). If anything is refused, nothing changes.

create function public.move_match_booking(p_booking bigint, p_slot bigint) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_me bigint := public.current_member_id(); b public.bookings; v_old date; v_new date; v_ids bigint[]; v_bps bigint[]; v_lineups jsonb; r jsonb;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found then raise exception 'That booking no longer exists.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.booking_players where booking_id = b.id and member_id = v_me) then
    raise exception 'You can only move a booking you''re on.' using errcode = '42501';
  end if;
  if exists (select 1 from public.booking_players where booking_id = b.id and member_id is null) then
    raise exception 'A booking with guests can''t be moved. Cancel it and book again.' using errcode = 'P0001';
  end if;
  select date into v_old from public.tee_slots where id = b.slot_id;
  select date into v_new from public.tee_slots where id = p_slot;
  if v_new is null or v_new <> v_old or p_slot = b.slot_id then
    raise exception 'A match can only move to another time on the same day.' using errcode = 'P0001';
  end if;
  select array_agg(member_id), array_agg(id) into v_ids, v_bps from public.booking_players where booking_id = b.id;
  select jsonb_agg(jsonb_build_object('m', x)) into v_lineups from unnest(v_ids) x;
  if exists (select 1 from public.rounds r where r.slot_id = b.slot_id and exists (select 1 from jsonb_array_elements(v_lineups) x where r.lineup @> jsonb_build_array(x))
               and exists (select 1 from jsonb_array_elements(r.done) d where d = 'true')) then
    raise exception 'This match has already started, so it can''t move.' using errcode = 'P0001';
  end if;
  -- Off the old time: its unscored card, any on-the-day match it was part of, then the booking itself.
  delete from public.rounds r where r.slot_id = b.slot_id and exists (select 1 from jsonb_array_elements(v_lineups) x where r.lineup @> jsonb_build_array(x));
  update public.player_events e set status = 'cancelled', cancel_note = 'The ' || public.hhmm(b.slot_id) || ' tee time moved', cancelled_at = now(), cancelled_by = v_me
   where e.status in ('pending', 'accepted') and e.date >= current_date
     and exists (select 1 from jsonb_array_elements(e.players) p where (p->>'id')::bigint = any(v_bps));
  delete from public.bookings where id = b.id;
  -- On to the new time, booked by the same member as before (refusals undo all of the above).
  r := public.book_as(b.booked_by, p_slot, array(select x from unnest(v_ids) x where x <> b.booked_by), '[]', true);
  return r;
end $$;
revoke execute on function public.move_match_booking(bigint, bigint) from public, anon;
grant execute on function public.move_match_booking(bigint, bigint) to authenticated;
