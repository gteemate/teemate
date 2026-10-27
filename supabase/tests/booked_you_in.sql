-- Database tests: when someone books you onto a tee time you get a "booked you in" notice. Rolled back.
begin;
create schema t;
create table t.results (n serial, test text, ok boolean, detail text);
grant usage on schema t to anon, authenticated;
grant all on all tables in schema t to anon, authenticated;
grant all on all sequences in schema t to anon, authenticated;
create function t.ok(p_test text, p_ok boolean, p_detail text default null) returns void language sql as $$
  insert into t.results (test, ok, detail) values (p_test, coalesce(p_ok, false), p_detail) $$;
grant execute on all functions in schema t to anon, authenticated;

insert into public.members (id, name) values (991001, 'Office Admin Y'), (991002, 'Pat Reid'), (991003, 'Chris Lowe'), (991004, 'Jo Banks');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'by-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 4) i;
update public.members m set user_id = (select id from auth.users where email = 'by-' || (m.id - 991000) || '@example.invalid'), admin = (m.id in (991001, 991002)) where m.id between 991001 and 991004;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;
-- Far enough ahead that nobody is booked yet; Pat is an admin so the release rule doesn't stop the booking.
create function t.slot(p_time int) returns bigint language sql as $$
  select id from public.tee_slots where date = current_date + 20 and start_time = p_time order by course_id limit 1 $$;
grant execute on function t.slot(int) to authenticated;

do $$ declare r jsonb; v_b bigint; v_req bigint; v_n public.booking_notices; s1 bigint; s2 bigint; s3 bigint; begin
  perform t.act_as(991001);
  perform public.get_tee_sheet(current_date + 20); -- makes that day's tee times
  reset role;
  s1 := t.slot(480); s2 := t.slot(660); s3 := t.slot(840); -- far apart, so the 2-hour gap rule doesn't get in the way

  -- Pat books Chris and a guest in.
  perform t.act_as(991002);
  r := public.book_tee_time(s1, array[991003::bigint], '[{"name":"Sam Guest"}]');
  reset role;
  v_b := (r->>'id')::bigint;
  select * into v_n from public.booking_notices where member_id = 991003 and kind = 'added';
  perform t.ok('Chris is told Pat booked him in, for that day and time',
    v_n.booking_id = v_b and v_n.by_name = 'Pat Reid' and v_n.date = current_date + 20 and v_n.old_time = (select start_time from public.tee_slots where id = s1), row_to_json(v_n)::text);
  perform t.ok('The notice lists the others on it by first name, without Chris', v_n.with_names = array['Pat', 'Sam'], v_n.with_names::text);
  perform t.ok('Pat, who booked it, isn''t told', not exists (select 1 from public.booking_notices where member_id = 991002));

  -- The office moves it: no new "booked you in", and the old one goes with the old booking.
  perform t.act_as(991001);
  r := public.admin_move_booking(v_b, s2, '');
  reset role;
  perform t.ok('A move sends no "booked you in" notice',
    not exists (select 1 from public.booking_notices where kind = 'added' and member_id between 991001 and 991004), -- only these tests' members: live has real notices
    (select string_agg(kind || ':' || member_id, ',') from public.booking_notices where member_id between 991001 and 991004));
  perform t.ok('Chris is told about the move as before', exists (select 1 from public.booking_notices where member_id = 991003 and kind = 'moved'));

  -- Jo asks for a time with Chris; the office approves it.
  insert into public.tee_time_requests (member_id, slot_id, member_ids, reason) values (991004, s3, array[991003::bigint], 'Early start') returning id into v_req;
  perform t.act_as(991001);
  r := public.admin_decide_tee_time_request(v_req, true, null);
  reset role;
  perform t.ok('Chris is told Jo booked him in when the request is approved',
    exists (select 1 from public.booking_notices where member_id = 991003 and kind = 'added' and by_name = 'Jo Banks' and booking_id = (r->>'id')::bigint));
  perform t.ok('Jo, who asked, gets no "booked you in" (the request answer tells her)',
    not exists (select 1 from public.booking_notices where member_id = 991004 and kind = 'added'));

  -- Jo cancels it before Chris has seen the notice.
  perform t.act_as(991004);
  perform public.cancel_booking((r->>'id')::bigint);
  reset role;
  perform t.ok('A cancelled booking takes its "booked you in" notice with it',
    not exists (select 1 from public.booking_notices where member_id = 991003 and kind = 'added'));

  perform t.act_as(991003);
  perform t.ok('Members still see only their own notices', (select bool_and(member_id = 991003) from public.booking_notices));
  reset role;
end $$;

select test, ok, detail from t.results order by n;
rollback;
