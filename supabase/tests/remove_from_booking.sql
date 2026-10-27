-- Database tests: whoever made a booking can take anyone off it, one at a time (themselves too). Rolled back.
begin;
create schema t;
create table t.results (n serial, test text, ok boolean, detail text);
grant usage on schema t to anon, authenticated;
grant all on all tables in schema t to anon, authenticated;
grant all on all sequences in schema t to anon, authenticated;
create function t.ok(p_test text, p_ok boolean, p_detail text default null) returns void language sql as $$
  insert into t.results (test, ok, detail) values (p_test, coalesce(p_ok, false), p_detail) $$;
create function t.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return null; exception when others then return sqlerrm; end $$;
grant execute on all functions in schema t to anon, authenticated;

insert into public.members (id, name) values (992001, 'Office Admin R'), (992002, 'Pat Reid'), (992003, 'Chris Lowe'), (992004, 'Jo Banks');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'rm-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 4) i;
update public.members m set user_id = (select id from auth.users where email = 'rm-' || (m.id - 992000) || '@example.invalid'), admin = (m.id in (992001, 992002)) where m.id between 992001 and 992004;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;
-- Far enough ahead that nobody is booked yet; Pat is an admin so the release rule doesn't stop the booking.
create function t.slot(p_time int) returns bigint language sql as $$
  select id from public.tee_slots where date = current_date + 21 and start_time = p_time order by course_id limit 1 $$;
create function t.bp(p_booking bigint, p_name text) returns bigint language sql as $$
  select bp.id from public.booking_players bp left join public.members m on m.id = bp.member_id
   where bp.booking_id = p_booking and coalesce(m.name, bp.guest_name) = p_name $$;
grant execute on all functions in schema t to authenticated;

do $$ declare r jsonb; v_b bigint; s1 bigint; e text; v_people jsonb; begin
  perform t.act_as(992001);
  perform public.get_tee_sheet(current_date + 21); -- makes that day's tee times
  reset role;
  s1 := t.slot(600);

  -- Pat books Chris, Jo and a guest.
  perform t.act_as(992002);
  r := public.book_tee_time(s1, array[992003, 992004]::bigint[], '[{"name":"Sam Guest"}]');
  reset role;
  v_b := (r->>'id')::bigint;

  perform t.act_as(992002);
  v_people := (select x->'people' from jsonb_array_elements(public.get_my_bookings()) x where (x->>'id')::bigint = v_b);
  reset role;
  perform t.ok('Take off: the bookings list gives each person''s place on the booking, to take them off',
    (select bool_and((p->>'bp') is not null) from jsonb_array_elements(v_people) p), v_people::text);

  -- Chris is on it but didn't make it: he can't take Jo off.
  perform t.act_as(992003);
  e := t.err(format('select public.remove_from_booking(%s, %s)', v_b, t.bp(v_b, 'Jo Banks')));
  reset role;
  perform t.ok('Take off: only the member who made the booking', e = 'Only the member who made the booking can take people off it.', e);

  -- Pat takes the guest off: the guest points come back.
  perform t.act_as(992002);
  r := public.remove_from_booking(v_b, t.bp(v_b, 'Sam Guest'));
  reset role;
  perform t.ok('Take off: a guest comes off and the guest points come back',
    r->>'result' = 'removed' and (r->>'pointsBack')::int > 0 and t.bp(v_b, 'Sam Guest') is null
    and not exists (select 1 from public.guest_visits where member_id = 992002 and guest_name = 'Sam Guest'), r::text);

  -- Pat takes Chris off: his "booked you in" notice goes; Jo's stays.
  perform t.act_as(992002);
  r := public.remove_from_booking(v_b, t.bp(v_b, 'Chris Lowe'));
  reset role;
  perform t.ok('Take off: a member comes off; the rest of the booking stays',
    t.bp(v_b, 'Chris Lowe') is null and t.bp(v_b, 'Jo Banks') is not null and t.bp(v_b, 'Pat Reid') is not null, r::text);
  perform t.ok('Take off: their "booked you in" notice goes with them',
    not exists (select 1 from public.booking_notices where member_id = 992003 and booking_id = v_b)
    and exists (select 1 from public.booking_notices where member_id = 992004 and booking_id = v_b));

  perform t.act_as(992002);
  e := t.err(format('select public.remove_from_booking(%s, %s)', v_b, (select max(id) + 1 from public.booking_players)));
  reset role;
  perform t.ok('Take off: someone not on the booking is refused', e = 'That player is no longer on this booking.', e);

  -- Pat takes himself off: Jo keeps the time, and Pat still sees (and manages) the booking.
  perform t.act_as(992002);
  r := public.remove_from_booking(v_b, t.bp(v_b, 'Pat Reid'));
  perform t.ok('Take off: the booker can take themselves off; the booking stays theirs to manage',
    t.bp(v_b, 'Pat Reid') is null and t.bp(v_b, 'Jo Banks') is not null
    and exists (select 1 from jsonb_array_elements(public.get_my_bookings()) x where (x->>'id')::bigint = v_b and (x->>'mine')::boolean), r::text);

  -- The last one off: the booking goes.
  r := public.remove_from_booking(v_b, t.bp(v_b, 'Jo Banks'));
  reset role;
  perform t.ok('Take off: taking the last person off deletes the booking',
    r->>'result' = 'deleted' and not exists (select 1 from public.bookings where id = v_b), r::text);
end $$;

select test, ok, detail from t.results order by n;
rollback;
