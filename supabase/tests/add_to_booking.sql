-- Database tests: anyone on a booking can add players or guests to it while the time has room. Rolled back.
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

insert into public.members (id, name) values (994001, 'Office Admin A'), (994002, 'Pat Reid'), (994003, 'Chris Lowe'), (994004, 'Jo Banks'), (994005, 'Sam Doyle'), (994006, 'Kim Walsh');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'ad-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 6) i;
update public.members m set user_id = (select id from auth.users where email = 'ad-' || (m.id - 994000) || '@example.invalid'), admin = (m.id in (994001, 994002)) where m.id between 994001 and 994006;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;
create function t.slot(p_time int) returns bigint language sql as $$
  select id from public.tee_slots where date = current_date + 22 and start_time = p_time order by course_id limit 1 $$;
grant execute on all functions in schema t to authenticated;

do $$ declare r jsonb; v_b bigint; s1 bigint; e text; v_cap int; begin
  perform t.act_as(994001);
  perform public.get_tee_sheet(current_date + 22); -- makes that day's tee times
  reset role;
  s1 := t.slot(600);
  v_cap := (select capacity from public.tee_slots where id = s1);

  -- Pat books himself and Chris.
  perform t.act_as(994002);
  r := public.book_tee_time(s1, array[994003]::bigint[], '[]');
  reset role;
  v_b := (r->>'id')::bigint;

  perform t.act_as(994003);
  perform t.ok('Add: the bookings list says how many places the time has',
    (select (x->>'capacity')::int from jsonb_array_elements(public.get_my_bookings()) x where (x->>'id')::bigint = v_b) = v_cap);
  -- Chris didn't make the booking but is on it: he adds Jo.
  r := public.add_to_booking(v_b, array[994004]::bigint[], '[]');
  reset role;
  perform t.ok('Add: someone on the booking (not only who made it) adds a member to it',
    exists (select 1 from public.booking_players where booking_id = v_b and member_id = 994004) and (r->>'added')::int = 1, r::text);
  perform t.ok('Add: the new player is told who booked them in',
    exists (select 1 from public.booking_notices where member_id = 994004 and kind = 'added' and booking_id = v_b and by_name = 'Chris Lowe'));
  perform t.ok('Add: the others already on it aren''t told again',
    (select count(*) from public.booking_notices where member_id = 994003 and kind = 'added' and booking_id = v_b) = 1);

  -- Chris adds a guest: the points are Chris's.
  perform t.act_as(994003);
  r := public.add_to_booking(v_b, '{}', '[{"name":"Alex Guest"}]');
  reset role;
  perform t.ok('Add: a guest added is charged to whoever adds them',
    exists (select 1 from public.guest_visits v join public.booking_players bp on bp.id = v.booking_player_id
             where bp.booking_id = v_b and v.member_id = 994003 and v.guest_name = 'Alex Guest'), r::text);

  perform t.act_as(994005);
  e := t.err(format('select public.add_to_booking(%s, array[994006]::bigint[], ''[]'')', v_b));
  reset role;
  perform t.ok('Add: someone not on the booking can''t add to it', e = 'That isn''t your booking.', e);

  perform t.act_as(994003);
  e := t.err(format('select public.add_to_booking(%s, array[994004]::bigint[], ''[]'')', v_b));
  reset role;
  perform t.ok('Add: someone already on the time is refused', e = 'One of your group is already booked on this time.', e);

  perform t.act_as(994003);
  e := t.err(format('select public.add_to_booking(%s, ''{}'', ''[]'')', v_b));
  reset role;
  perform t.ok('Add: nobody to add is refused', e = 'Add a player or guest first.', e);

  -- Fill it (4 places), then one more is refused.
  if v_cap = 4 then
    perform t.act_as(994003);
    e := t.err(format('select public.add_to_booking(%s, array[994006]::bigint[], ''[]'')', v_b));
    reset role;
    perform t.ok('Add: a full time is refused', e = 'Sorry, there’s no space left on this time.', e);
  end if;
end $$;

select test, ok, detail from t.results order by n;
rollback;
