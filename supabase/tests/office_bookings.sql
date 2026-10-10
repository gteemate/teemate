-- Database tests: the club office cancels and moves members' bookings; everyone on them gets a notice. Rolled back.
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

insert into public.members (id, name) values (990901, 'Office Admin B'), (990902, 'Booker B'), (990903, 'Friend B');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'ob-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 3) i;
update public.members m set user_id = (select id from auth.users where email = 'ob-' || (m.id - 990900) || '@example.invalid'), admin = (m.id = 990901) where m.id between 990901 and 990903;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;
create function t.slot(p_time int) returns bigint language sql as $$
  select id from public.tee_slots where date = current_date + 20 and start_time = p_time order by course_id limit 1 $$;
grant execute on function t.slot(int) to authenticated;

do $$ declare e text; r jsonb; v_b bigint; v_sheet jsonb; begin
  perform t.act_as(990901);
  perform public.get_tee_sheet(current_date + 20); -- makes that day's tee times
  reset role;
  r := public.book_as(990902, t.slot(600), array[990903::bigint], '[{"name":"Sam Guest","club":"Portrush"}]', false);
  v_b := (r->>'id')::bigint;

  perform t.act_as(990901);
  v_sheet := public.get_tee_sheet(current_date + 20);
  perform t.ok('The tee sheet says which booking each player is on',
    (select bool_and((p->>'bookingId')::bigint = v_b) from jsonb_array_elements(v_sheet) s, jsonb_array_elements(s->'players') p where (s->>'time')::int = 600));
  reset role;

  perform t.act_as(990902);
  e := t.err(format('select public.admin_move_booking(%s, %s)', v_b, t.slot(700)));
  perform t.ok('Members can''t move bookings with the office''s powers', e like '%Only the club office%', e);
  e := t.err(format('select public.admin_cancel_booking(%s)', v_b));
  perform t.ok('Members can''t cancel them either', e like '%Only the club office%', e);
  reset role;

  perform t.act_as(990901);
  r := public.admin_move_booking(v_b, t.slot(700), 'Society on the tee at 10');
  reset role;
  perform t.ok('A move keeps the booker, the members and the guest, at the new time',
    (select b.booked_by = 990902 and (select array_agg(coalesce(member_id::text, guest_name) order by id) from public.booking_players where booking_id = b.id) = array['990902', '990903', 'Sam Guest']
       from public.bookings b where b.id = (r->>'id')::bigint and b.slot_id = t.slot(700)), r::text);
  perform t.ok('Nothing is left at the old time', not exists (select 1 from public.booking_players where slot_id = t.slot(600)));
  perform t.ok('The guest is charged once, not twice', (select count(*) from public.guest_visits where member_id = 990902 and guest_name = 'Sam Guest') = 1);
  perform t.ok('Both members get a notice with the times and the note',
    (select count(*) from public.booking_notices where member_id in (990902, 990903) and kind = 'moved' and old_time = 600 and new_time = 700 and note = 'Society on the tee at 10') = 2);

  perform t.act_as(990903);
  perform t.ok('Members see only their own notices', (select count(*) from public.booking_notices) = 1);
  perform public.seen_booking_notice((select id from public.booking_notices));
  perform t.ok('OK marks it seen', (select seen from public.booking_notices));
  reset role;

  perform t.act_as(990901);
  r := public.admin_cancel_booking((r->>'id')::bigint, '');
  reset role;
  perform t.ok('A cancel removes the booking and gives the guest points back',
    not exists (select 1 from public.booking_players where slot_id = t.slot(700)) and not exists (select 1 from public.guest_visits where member_id = 990902 and guest_name = 'Sam Guest'));
  perform t.ok('Everyone on it is told (a blank note is no note)',
    (select count(*) from public.booking_notices where kind = 'cancelled' and member_id in (990902, 990903) and note is null and old_time = 700) = 2 and (r->>'told')::int = 2);

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  e := t.err('select public.admin_cancel_booking(1)');
  perform t.ok('Visitors can''t call it', e like '%permission denied%', e);
  reset role;
end $$;

select test, ok, detail from t.results order by n;
rollback;
