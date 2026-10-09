-- Database tests: tee time requests (ask for a day not open yet; an admin approves = booked as the member). Rolled back.
begin;
create schema t;
create table t.results (n serial, test text, ok boolean, detail text);
create table t.ids (k text primary key, id bigint);
grant usage on schema t to anon, authenticated;
grant all on all tables in schema t to anon, authenticated;
grant all on all sequences in schema t to anon, authenticated;
create function t.ok(p_test text, p_ok boolean, p_detail text default null) returns void language sql as $$
  insert into t.results (test, ok, detail) values (p_test, coalesce(p_ok, false), p_detail) $$;
create function t.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return null; exception when others then return sqlerrm; end $$;
create function t.id(p_k text) returns bigint language sql as $$ select id from t.ids where k = p_k $$;
create function t.set(p_k text, p_id bigint) returns void language sql as $$ insert into t.ids values (p_k, p_id) on conflict (k) do update set id = excluded.id $$;
grant execute on all functions in schema t to anon, authenticated;

-- Members: an admin, a member who asks, their buddy, a member out of guest points, four to fill a tee time.
insert into public.members (id, name) select 990500 + i, 'Request Test ' || i from generate_series(1, 8) i;
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'req-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 8) i;
update public.members m set user_id = (select id from auth.users where email = 'req-test-' || (m.id - 990500) || '@example.invalid'), admin = (m.id = 990501)
 where m.id between 990501 and 990508;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;
update public.club_settings set release_time = '20:00', release_days = 8, release_weekends_only = false where id = 1;
-- Member 4 has used all 36 guest points this year.
delete from public.guest_visits where member_id = 990504;
insert into public.guest_visits (member_id, date, guest_name, course_id, points) select 990504, current_date, 'G', 1, 3 from generate_series(1, 12);
-- Tee times far ahead (not open yet) and one tomorrow (open).
with s as (insert into public.tee_slots (course_id, date, start_time) values (1, current_date + 30, 7), (1, current_date + 30, 300), (1, current_date + 31, 7), (1, current_date + 1, 7) returning id, date, start_time)
insert into t.ids select case when date = current_date + 1 then 'open' when start_time = 300 then 'far2' when date = current_date + 31 then 'far3' else 'far' end, id from s;

do $$ declare e text; r bigint; j jsonb; begin
  perform t.act_as(990502);
  r := public.request_tee_time(t.id('far'), '{990503}', '[{"name":"Visitor"}]', '  Visitors flying in from Boston  ');
  perform t.set('req', r);
  perform t.ok('Request: a day not open yet', (select status = 'pending' and reason = 'Visitors flying in from Boston' and member_id = 990502 from public.tee_time_requests where id = r));
  e := t.err(format('select public.request_tee_time(%s, ''{}'', ''[]'', ''x'')', t.id('open')));
  perform t.ok('Request: an open day is refused (book it instead)', e like '%book it instead%', e);
  e := t.err(format('select public.request_tee_time(%s, ''{}'', ''[]'', ''   '')', t.id('far2')));
  perform t.ok('Request: a reason is required', e like '%reason%', e);
  perform public.request_tee_time(t.id('far2'), '{}', '[]', 'Second');
  perform public.request_tee_time(t.id('far3'), '{}', '[]', 'Third');
  e := t.err(format('select public.request_tee_time(%s, ''{}'', ''[]'', ''Fourth'')', t.id('far2')));
  perform t.ok('Request: at most 3 waiting per member', e like '%3 requests%', e);
  reset role;

  perform t.act_as(990503);
  perform t.ok('Privacy: a member sees only their own requests', not exists (select 1 from public.tee_time_requests where member_id = 990502));
  e := t.err(format('select public.cancel_tee_time_request(%s)', t.id('req')));
  perform t.ok('Cancel: only the member who asked', e is not null, e);
  e := t.err(format('select public.admin_decide_tee_time_request(%s, true, null)', t.id('req')));
  perform t.ok('Decide: members can''t approve', e like '%Only admins%', e);
  reset role;

  perform t.act_as(990501);
  j := public.admin_decide_tee_time_request(t.id('req'), true, null);
  reset role; -- check the booking itself (members, admins included, only see bookings they're on)
  perform t.ok('Approve: booked as the member who asked (they and their buddy play, the admin doesn''t)',
    (select array_agg(member_id order by member_id) from public.booking_players where slot_id = t.id('far') and member_id is not null) = '{990502,990503}'
    and (select booked_by from public.bookings where slot_id = t.id('far')) = 990502,
    format('players %s, booked_by %s', (select array_agg(member_id order by member_id) from public.booking_players where slot_id = t.id('far')), (select array_agg(booked_by) from public.bookings where slot_id = t.id('far'))));
  perform t.ok('Approve: the guest uses the member''s guest points', exists (select 1 from public.guest_visits where member_id = 990502 and guest_name = 'Visitor'));
  perform t.act_as(990501);
  perform t.ok('Approve: request marked approved, with its booking, not seen yet',
    (select status = 'approved' and booking_id is not null and not seen from public.tee_time_requests where id = t.id('req')));
  e := t.err(format('select public.admin_decide_tee_time_request(%s, false, ''x'')', t.id('req')));
  perform t.ok('Decide: only waiting requests', e like '%no longer waiting%', e);
  reset role;

  -- A request for a time that has since filled up, and one from a member out of guest points.
  perform t.act_as(990502); perform t.set('full', public.request_tee_time(t.id('far2'), '{}', '[]', 'Filled later')); reset role;
  perform public.book_as(990505, t.id('far2'), '{990506,990507,990508}', '[]', false);
  perform t.act_as(990504); perform t.set('nopts', public.request_tee_time(t.id('far3'), '{}', '[{"name":"Guest"}]', 'Out of points')); reset role;
  perform t.act_as(990501);
  e := t.err(format('select public.admin_decide_tee_time_request(%s, true, null)', t.id('full')));
  perform t.ok('Approve when full: the booking''s reason, and the request still waits', e like '%just been taken%' and (select status from public.tee_time_requests where id = t.id('full')) = 'pending', e);
  e := t.err(format('select public.admin_decide_tee_time_request(%s, true, null)', t.id('nopts')));
  perform t.ok('Approve with no guest points left: refused, still waiting', e like '%guest points%' and (select status from public.tee_time_requests where id = t.id('nopts')) = 'pending', e);
  e := t.err(format('select public.admin_decide_tee_time_request(%s, false, ''  '')', t.id('full')));
  perform t.ok('Decline: a note is required', e like '%note%', e);
  perform public.admin_decide_tee_time_request(t.id('full'), false, 'That time filled up, sorry. Try 08:30?');
  perform t.ok('Decline: with a note', (select status = 'declined' and admin_note like 'That time%' from public.tee_time_requests where id = t.id('full')));
  reset role;

  perform t.act_as(990504);
  perform public.cancel_tee_time_request(t.id('nopts'));
  perform t.ok('Cancel: the member, while it waits', (select status from public.tee_time_requests where id = t.id('nopts')) = 'cancelled');
  reset role;

  perform t.act_as(990502);
  perform public.mark_tee_time_requests_seen();
  perform t.ok('Seen: decided requests are marked seen', not exists (select 1 from public.tee_time_requests where member_id = 990502 and status in ('approved', 'declined') and not seen));
  perform t.ok('Tee sheet: 11 months ahead has tee times', jsonb_array_length(public.get_tee_sheet(current_date + 330)) > 0);
  reset role;

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  e := t.err(format('select public.request_tee_time(%s, ''{}'', ''[]'', ''x'')', t.id('far')));
  perform t.ok('Visitors can''t request', e is not null, e);
  reset role;
end $$;

select test, ok, detail from t.results order by n;
rollback;
