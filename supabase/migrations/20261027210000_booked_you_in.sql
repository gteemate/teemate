-- "Booked you in": when a member books others onto a tee time (or the office approves a request that has others on
-- it), everyone on the booking except the booker gets a notice. It names who booked and who else is playing (first
-- names, taken when it was booked), and goes when the booking does (a cancel or a move removes the old booking).
-- Moves go through book_as() too, so the notice is sent by the two callers that make new bookings, not by book_as().

alter table public.booking_notices drop constraint booking_notices_kind_check;
alter table public.booking_notices add constraint booking_notices_kind_check check (kind in ('cancelled', 'moved', 'added'));
alter table public.booking_notices add column booking_id bigint references public.bookings on delete cascade;
alter table public.booking_notices add column by_name text;
alter table public.booking_notices add column with_names text[];

create function public.notify_added(p_booking bigint) returns void
language sql security definer set search_path to '' as $$
  insert into public.booking_notices (member_id, kind, date, old_time, booking_id, by_name, with_names)
  select bp.member_id, 'added', s.date, s.start_time, b.id, booker.name,
         array(select split_part(coalesce(m2.name, o.guest_name), ' ', 1) from public.booking_players o
                 left join public.members m2 on m2.id = o.member_id
                where o.booking_id = b.id and o.id <> bp.id order by o.id)
    from public.booking_players bp
    join public.bookings b on b.id = bp.booking_id
    join public.tee_slots s on s.id = b.slot_id
    join public.members booker on booker.id = b.booked_by
   where bp.booking_id = p_booking and bp.member_id is not null and bp.member_id <> b.booked_by
$$;
revoke execute on function public.notify_added(bigint) from public, anon, authenticated;

create or replace function public.book_tee_time(p_slot_id bigint, p_member_ids bigint[] default '{}', p_guests jsonb default '[]')
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  v := public.book_as(public.current_member_id(), p_slot_id, p_member_ids, p_guests, not public.is_admin());
  perform public.notify_added((v->>'id')::bigint);
  return v;
end $$;

create or replace function public.admin_decide_tee_time_request(p_id bigint, p_approve boolean, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.tee_time_requests; v jsonb;
begin
  if not public.is_admin() then raise exception 'Only admins can answer tee time requests.' using errcode = '42501'; end if;
  select * into r from public.tee_time_requests where id = p_id for update;
  if not found or r.status <> 'pending' then raise exception 'This request is no longer waiting.' using errcode = 'P0001'; end if;
  if p_approve then
    v := public.book_as(r.member_id, r.slot_id, r.member_ids, r.guests, false);
    perform public.notify_added((v->>'id')::bigint); -- the others on it (the member who asked gets the answer instead)
    update public.tee_time_requests set status = 'approved', booking_id = (v->>'id')::bigint, admin_note = nullif(trim(coalesce(p_note, '')), ''),
      decided_by = public.current_member_id(), decided_at = now() where id = p_id;
    return v;
  end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Add a note for the member saying why.' using errcode = 'P0001'; end if;
  update public.tee_time_requests set status = 'declined', admin_note = trim(p_note), decided_by = public.current_member_id(), decided_at = now() where id = p_id;
  return jsonb_build_object('declined', true);
end $$;
