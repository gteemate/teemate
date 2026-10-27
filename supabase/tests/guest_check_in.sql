-- Database tests: the club office checks in guests who weren't booked in the app, charging the member's guest points;
-- today's office charges can be removed (points back). Rolled back.
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

insert into public.members (id, name) values (993001, 'Office Admin C'), (993002, 'Pat Reid'), (993003, 'Chris Lowe');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'ci-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 3) i;
update public.members m set user_id = (select id from auth.users where email = 'ci-' || (m.id - 993000) || '@example.invalid'), admin = (m.id = 993001) where m.id between 993001 and 993003;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;
create function t.used(p_member bigint) returns int language sql as $$
  select coalesce(sum(points), 0)::int from public.guest_visits where member_id = p_member and date_trunc('year', date) = date_trunc('year', public.club_today()) $$;

do $$ declare r jsonb; e text; v_cost int; v_allow int; v_id bigint; v_n int; begin
  v_cost := (select guest_points from public.courses order by id limit 1);
  v_allow := (select guest_allowance from public.club_settings where id = 1);

  perform t.act_as(993003);
  e := t.err($q$select public.office_charge_guests(993002, 'Pat Reid', '[{"name":"Sam Guest"}]')$q$);
  reset role;
  perform t.ok('Check-in: only admins can charge', e = 'Only the club office can check in guests.', e);

  perform t.act_as(993001);
  r := public.office_charge_guests(993002, 'pat  REID', '[{"name":"Sam Guest","club":"Portrush"},{"name":"Alex Moore"}]');
  reset role;
  perform t.ok('Check-in: two guests charged, points left is right',
    (r->>'charged')::int = 2 * v_cost and (r->>'pointsLeft')::int = v_allow - 2 * v_cost and t.used(993002) = 2 * v_cost
    and (select count(*) from public.guest_visits where member_id = 993002 and checked_in_by = 993001 and booking_player_id is null) = 2, r::text);

  perform t.act_as(993001);
  e := t.err($q$select public.office_charge_guests(993002, 'Chris Lowe', '[{"name":"Sam Guest"}]')$q$);
  reset role;
  perform t.ok('Check-in: the card''s name must match the member', e = 'That isn''t a TeeMate member card.', e);

  perform t.act_as(993001);
  e := t.err($q$select public.office_charge_guests(993002, null, '[{"name":"  "}]')$q$);
  reset role;
  perform t.ok('Check-in: a blank guest name is refused', e = 'Add the guest''s name.', e);

  perform t.act_as(993001);
  e := t.err($q$select public.office_charge_guests(993002, null, '[{"name":"A"},{"name":"B"},{"name":"C"},{"name":"D"}]')$q$);
  reset role;
  perform t.ok('Check-in: more than 3 guests is refused', e = 'Check in 1 to 3 guests at a time.', e);

  -- Use up all but one guest's worth, then ask for two.
  insert into public.guest_visits (member_id, date, guest_name, course_id, points)
    values (993003, public.club_today(), 'Earlier guest', (select id from public.courses order by id limit 1), v_allow - v_cost);
  v_n := (select count(*) from public.guest_visits where member_id = 993003);
  perform t.act_as(993001);
  e := t.err($q$select public.office_charge_guests(993003, null, '[{"name":"One"},{"name":"Two"}]')$q$);
  reset role;
  perform t.ok('Check-in: over the allowance is refused, nothing charged',
    e = format('Not enough guest points: Chris has %s left.', v_cost) and (select count(*) from public.guest_visits where member_id = 993003) = v_n, e);

  v_id := (select id from public.guest_visits where member_id = 993002 and guest_name = 'Alex Moore');
  perform t.act_as(993001);
  r := public.office_remove_guest_charge(v_id);
  reset role;
  perform t.ok('Check-in: remove gives the points back', (r->>'pointsBack')::int = v_cost and t.used(993002) = v_cost, r::text);

  v_id := (select id from public.guest_visits where member_id = 993003 and guest_name = 'Earlier guest');
  perform t.act_as(993001);
  e := t.err(format('select public.office_remove_guest_charge(%s)', v_id));
  reset role;
  perform t.ok('Check-in: a booked guest can''t be removed here', e = 'Only today''s check-ins at the office can be removed here.', e);

  update public.guest_visits set date = public.club_today() - 1 where member_id = 993002 and guest_name = 'Sam Guest' returning id into v_id;
  perform t.act_as(993001);
  e := t.err(format('select public.office_remove_guest_charge(%s)', v_id));
  r := public.office_guest_charges_today();
  reset role;
  perform t.ok('Check-in: yesterday''s charge can''t be removed', e = 'Only today''s check-ins at the office can be removed here.', e);
  perform t.ok('Check-in: today''s list shows office charges only',
    not exists (select 1 from jsonb_array_elements(r) x where (x->>'memberId')::bigint in (993002, 993003)), r::text);

  perform t.act_as(993001);
  r := public.office_charge_guests(993002, null, '[{"name":"Jo Banks"}]');
  r := public.office_guest_charges_today();
  reset role;
  perform t.ok('Check-in: today''s list has the charge, with the member''s name',
    exists (select 1 from jsonb_array_elements(r) x where x->>'memberName' = 'Pat Reid' and x->>'guest' = 'Jo Banks' and (x->>'points')::int = v_cost), r::text);

  perform t.act_as(993003);
  perform t.ok('Check-in: members see only their own charges', (select bool_and(member_id = 993003) from public.guest_visits));
  e := t.err('select public.office_guest_charges_today()');
  reset role;
  perform t.ok('Check-in: only the office sees today''s list', e = 'Only the club office can check in guests.', e);
end $$;

select test, ok, detail from t.results order by n;
rollback;
