-- A club singles match holds one tee time, not several: booking it again while it's booked is refused (so nobody can
-- hold four-balls for nothing), and a match whose result is in no longer holds places.

create function public.hhmm_of(p_min int) returns text
language sql immutable set search_path to '' as $$ select lpad((p_min / 60)::text, 2, '0') || ':' || lpad((p_min % 60)::text, 2, '0') $$;

create or replace function public.book_club_match(p_slot bigint, p_opponent bigint, p_kind text, p_ref bigint) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_me bigint := public.current_member_id(); v_when date; v_at int; c public.signup_comps; ev public.events; x jsonb; v_label text; r jsonb; v_cap int; v_id bigint;
begin
  if p_kind = 'ko' then
    select * into c from public.signup_comps where id = p_ref;
    if not found or not exists (
         select 1 from public.ko_matches m join public.signup_entries ea on ea.id = m.a_entry join public.signup_entries eb on eb.id = m.b_entry
          where m.comp_id = c.id and m.status in ('open', 'disputed')
            and ((ea.member_id = v_me and eb.member_id = p_opponent) or (ea.member_id = p_opponent and eb.member_id = v_me))) then
      raise exception 'That isn''t your match.' using errcode = '42501';
    end if;
    if c.created_by is not null or c.kind <> 'singles' then
      raise exception 'Only club singles matches hold the other places.' using errcode = 'P0001';
    end if;
    v_label := c.name;
  elsif p_kind = 'event' then
    select * into ev from public.events where id = p_ref;
    if found then
      select m into x from jsonb_each(ev.matches) d, jsonb_array_elements(d.value) m
       where (m->'a' @> to_jsonb(v_me) and m->'b' @> to_jsonb(p_opponent)) or (m->'b' @> to_jsonb(v_me) and m->'a' @> to_jsonb(p_opponent))
       limit 1;
    end if;
    if x is null then
      raise exception 'That isn''t your match.' using errcode = '42501';
    end if;
    if not ev.club or jsonb_array_length(x->'a') <> 1 or jsonb_array_length(x->'b') <> 1 then
      raise exception 'Only club singles matches hold the other places.' using errcode = 'P0001';
    end if;
    v_label := ev.name;
  else
    raise exception 'That isn''t your match.' using errcode = '42501';
  end if;
  -- One tee time per match: a second hold for the same two would take another four-ball for nothing.
  select s.date, s.start_time into v_when, v_at from public.bookings bk join public.tee_slots s on s.id = bk.slot_id
   where bk.held > 0 and bk.held_for = v_label || ' match' and s.date >= public.club_today()
     and exists (select 1 from public.booking_players bp where bp.booking_id = bk.id and bp.member_id = v_me)
     and exists (select 1 from public.booking_players bp where bp.booking_id = bk.id and bp.member_id = p_opponent)
   limit 1;
  if v_when is not null then
    raise exception 'Your % match is already booked for % at %.', v_label, to_char(v_when, 'Dy FMDD Mon'), public.hhmm_of(v_at) using errcode = 'P0001';
  end if;
  r := public.book_as(v_me, p_slot, array[p_opponent], '[]', not public.is_admin());
  v_id := (r->>'id')::bigint;
  select capacity into v_cap from public.tee_slots where id = p_slot;
  update public.bookings set held = greatest(v_cap - 2, 0), held_for = v_label || ' match' where id = v_id;
  if public.slot_taken(p_slot) > v_cap then
    raise exception 'There isn’t room for the whole match on that time. Pick an empty time.' using errcode = 'P0001';
  end if;
  perform public.notify_added(v_id);
  return r || jsonb_build_object('held', greatest(v_cap - 2, 0), 'heldFor', v_label || ' match');
end $$;
