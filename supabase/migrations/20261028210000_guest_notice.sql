-- When the club office charges a member's guests, the member gets a notice in the app (the same drop-down as a
-- moved or cancelled tee time): the points used today and how many are left. Taking the charge off before it's seen
-- takes the notice with it.

alter table public.booking_notices drop constraint booking_notices_kind_check;
alter table public.booking_notices add constraint booking_notices_kind_check check (kind in ('cancelled', 'moved', 'added', 'guests'));
alter table public.booking_notices add column points int, add column points_left int, add column allowance int;

create or replace function public.office_charge_guests(p_member bigint, p_name text, p_guests jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me bigint := public.current_member_id(); m public.members; v_course public.courses; v_n int; v_g jsonb;
  v_used int; v_allow int := (select guest_allowance from public.club_settings where id = 1); v_today date := public.club_today();
  norm text;
begin
  if not public.is_admin() then raise exception 'Only the club office can check in guests.' using errcode = '42501'; end if;
  select * into m from public.members where id = p_member;
  -- From a scanned card the name has to match too, so a made-up or old card isn't taken as someone else.
  if not found or (p_name is not null and lower(regexp_replace(trim(p_name), '\s+', ' ', 'g')) <> lower(regexp_replace(trim(m.name), '\s+', ' ', 'g'))) then
    raise exception 'That isn''t a TeeMate member card.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_guests) <> 'array' or jsonb_array_length(p_guests) not between 1 and 3 then
    raise exception 'Check in 1 to 3 guests at a time.' using errcode = 'P0001';
  end if;
  for v_g in select * from jsonb_array_elements(p_guests) loop
    if length(trim(coalesce(v_g->>'name', ''))) not between 1 and 100 then
      raise exception 'Add the guest''s name.' using errcode = 'P0001';
    end if;
  end loop;
  select * into v_course from public.courses order by id limit 1;
  v_n := jsonb_array_length(p_guests);
  perform 1 from public.members where id = p_member for update; -- one charge at a time per member
  select coalesce(sum(points), 0) into v_used from public.guest_visits
   where member_id = p_member and date_trunc('year', date) = date_trunc('year', v_today);
  if v_used + v_n * v_course.guest_points > v_allow then
    raise exception 'Not enough guest points: % has % left.', split_part(m.name, ' ', 1), v_allow - v_used using errcode = 'P0001';
  end if;
  insert into public.guest_visits (member_id, date, guest_name, guest_club, course_id, points, checked_in_by)
    select p_member, v_today, trim(g->>'name'), nullif(trim(coalesce(g->>'club', '')), ''), v_course.id, v_course.guest_points, v_me
      from jsonb_array_elements(p_guests) g;
  -- The member is told in the app: points used today, and how many are left.
  insert into public.booking_notices (member_id, kind, date, old_time, with_names, points, points_left, allowance)
    values (p_member, 'guests', v_today, 0, array(select trim(g->>'name') from jsonb_array_elements(p_guests) g),
            v_n * v_course.guest_points, v_allow - v_used - v_n * v_course.guest_points, v_allow);
  return jsonb_build_object('charged', v_n * v_course.guest_points, 'pointsLeft', v_allow - v_used - v_n * v_course.guest_points);
end $$;

create or replace function public.office_remove_guest_charge(p_visit bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.guest_visits;
begin
  if not public.is_admin() then raise exception 'Only the club office can check in guests.' using errcode = '42501'; end if;
  select * into v from public.guest_visits where id = p_visit for update;
  if not found or v.checked_in_by is null or v.date <> public.club_today() then
    raise exception 'Only today''s check-ins at the office can be removed here.' using errcode = 'P0001';
  end if;
  delete from public.guest_visits where id = v.id;
  -- not seen yet: the notice would be wrong now, so it goes too
  delete from public.booking_notices where member_id = v.member_id and kind = 'guests' and date = v.date and not seen;
  return jsonb_build_object('pointsBack', v.points);
end $$;
