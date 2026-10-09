-- Tee time requests: a member asks for a tee time on a day not open yet, with a reason; an admin approves
-- (booked straight away as the member: book_as, every booking check) or declines with a note. Nothing is held
-- while a request waits. Members see their own; admins see all. Writes only through these functions.

create table public.tee_time_requests (
  id bigint generated always as identity primary key,
  member_id bigint not null references public.members (id) on delete cascade,
  slot_id bigint not null references public.tee_slots (id) on delete cascade,
  member_ids bigint[] not null default '{}',
  guests jsonb not null default '[]',
  reason text not null check (char_length(reason) between 1 and 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  admin_note text,
  decided_by bigint references public.members (id) on delete set null,
  decided_at timestamptz,
  booking_id bigint references public.bookings (id) on delete set null,
  seen boolean not null default false,
  created_at timestamptz not null default now()
);
create index tee_time_requests_member on public.tee_time_requests (member_id, status);
alter table public.tee_time_requests enable row level security;
create policy "own requests, or all for admins" on public.tee_time_requests for select to authenticated
  using (member_id = public.current_member_id() or public.is_admin());

create function public.request_tee_time(p_slot_id bigint, p_member_ids bigint[], p_guests jsonb, p_reason text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_me bigint := public.current_member_id(); v_slot public.tee_slots; v_reason text := trim(coalesce(p_reason, '')); v_at timestamptz; g jsonb; v_id bigint;
begin
  if v_me is null then raise exception 'Only members can request tee times.' using errcode = '42501'; end if;
  select * into v_slot from public.tee_slots where id = p_slot_id;
  if not found then raise exception 'That tee time no longer exists.' using errcode = 'P0001'; end if;
  if v_slot.date < current_date then raise exception 'That tee time has passed.' using errcode = 'P0001'; end if;
  v_at := public.tee_time_opens_at(v_slot.date);
  if v_at is null or v_at <= now() then raise exception 'This day is open, so book it instead.' using errcode = 'P0001'; end if;
  if char_length(v_reason) = 0 or char_length(v_reason) > 500 then
    raise exception 'Give a reason for the request (up to 500 characters).' using errcode = 'P0001';
  end if;
  if (select count(*) from public.members where id = any (coalesce(p_member_ids, '{}'))) <> cardinality(coalesce(p_member_ids, '{}')) then
    raise exception 'One of those players isn''t a member.' using errcode = 'P0001';
  end if;
  for g in select * from jsonb_array_elements(coalesce(p_guests, '[]')) loop
    if coalesce(trim(g->>'name'), '') = '' then raise exception 'Every guest needs a name.' using errcode = 'P0001'; end if;
  end loop;
  perform 1 from public.members where id = v_me for update; -- one at a time per member, for the limit
  if (select count(*) from public.tee_time_requests where member_id = v_me and status = 'pending') >= 3 then
    raise exception 'You can have at most 3 requests waiting. Cancel one or wait for an answer.' using errcode = 'P0001';
  end if;
  insert into public.tee_time_requests (member_id, slot_id, member_ids, guests, reason)
    values (v_me, p_slot_id, coalesce(p_member_ids, '{}'), coalesce(p_guests, '[]'), v_reason) returning id into v_id;
  return v_id;
end $$;

create function public.cancel_tee_time_request(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.tee_time_requests;
begin
  select * into r from public.tee_time_requests where id = p_id for update;
  if not found or r.member_id is distinct from public.current_member_id() then raise exception 'You can only cancel your own requests.' using errcode = '42501'; end if;
  if r.status <> 'pending' then raise exception 'This request is no longer waiting.' using errcode = 'P0001'; end if;
  update public.tee_time_requests set status = 'cancelled' where id = p_id;
end $$;

-- Approve: book it as the member who asked (if the booking is refused, its reason comes back and nothing changes).
create function public.admin_decide_tee_time_request(p_id bigint, p_approve boolean, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.tee_time_requests; v jsonb;
begin
  if not public.is_admin() then raise exception 'Only admins can answer tee time requests.' using errcode = '42501'; end if;
  select * into r from public.tee_time_requests where id = p_id for update;
  if not found or r.status <> 'pending' then raise exception 'This request is no longer waiting.' using errcode = 'P0001'; end if;
  if p_approve then
    v := public.book_as(r.member_id, r.slot_id, r.member_ids, r.guests, false);
    update public.tee_time_requests set status = 'approved', booking_id = (v->>'id')::bigint, admin_note = nullif(trim(coalesce(p_note, '')), ''),
      decided_by = public.current_member_id(), decided_at = now() where id = p_id;
    return v;
  end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Add a note for the member saying why.' using errcode = 'P0001'; end if;
  update public.tee_time_requests set status = 'declined', admin_note = trim(p_note), decided_by = public.current_member_id(), decided_at = now() where id = p_id;
  return jsonb_build_object('declined', true);
end $$;

create function public.mark_tee_time_requests_seen() returns void
language sql security definer set search_path = '' as $$
  update public.tee_time_requests set seen = true
   where member_id = public.current_member_id() and status in ('approved', 'declined') and not seen
$$;

revoke execute on function public.request_tee_time(bigint, bigint[], jsonb, text), public.cancel_tee_time_request(bigint),
  public.admin_decide_tee_time_request(bigint, boolean, text), public.mark_tee_time_requests_seen() from public, anon;
grant execute on function public.request_tee_time(bigint, bigint[], jsonb, text), public.cancel_tee_time_request(bigint),
  public.admin_decide_tee_time_request(bigint, boolean, text), public.mark_tee_time_requests_seen() to authenticated;

-- Tee times exist up to 12 months ahead, so far-off days can be requested (was 13 days).
create or replace function public.get_tee_sheet(p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_course bigint := (select id from public.courses order by id limit 1);
begin
  if public.current_member_id() is null then
    raise exception 'Only members can see the tee sheet.' using errcode = '42501';
  end if;
  if p_date between current_date and current_date + 366 then
    insert into public.tee_slots (course_id, date, start_time, twilight)
    select v_course, p_date, m, m >= 15 * 60
      from generate_series(7 * 60 + 30, 16 * 60 + 30, 10) m
     where not (m >= 12 * 60 + 20 and m < 13 * 60)
    on conflict do nothing;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', s.id, 'date', s.date, 'time', s.start_time, 'capacity', s.capacity, 'twilight', s.twilight,
             'players', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'id', bp.id, 'name', coalesce(m.name, bp.guest_name), 'memberId', bp.member_id,
                        'guest', bp.member_id is null, 'hcp', case when bp.member_id is null then bp.guest_hcp else m.hcp_index end)
                      order by bp.id)
                 from public.booking_players bp left join public.members m on m.id = bp.member_id
                where bp.slot_id = s.id), '[]'::jsonb))
           order by s.start_time)
      from public.tee_slots s
     where s.course_id = v_course and s.date = p_date), '[]'::jsonb);
end $function$;
