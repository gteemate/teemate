-- Database tests: when the club office charges a member's guests, the member gets a notice in the app saying how
-- many points were used and how many are left. Rolled back.
begin;
create schema t;
create table t.results (n serial, test text, ok boolean, detail text);
grant usage on schema t to anon, authenticated;
grant all on all tables in schema t to anon, authenticated;
grant all on all sequences in schema t to anon, authenticated;
create function t.ok(p_test text, p_ok boolean, p_detail text default null) returns void language sql as $$
  insert into t.results (test, ok, detail) values (p_test, coalesce(p_ok, false), p_detail) $$;
grant execute on all functions in schema t to anon, authenticated;

insert into public.members (id, name) values (998001, 'Office Admin N'), (998002, 'Pat Reid');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'gn-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 2) i;
update public.members m set user_id = (select id from auth.users where email = 'gn-' || (m.id - 998000) || '@example.invalid'), admin = (m.id = 998001) where m.id between 998001 and 998002;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;

do $$ declare r jsonb; n public.booking_notices; v_cost int; v_allow int; v_visit bigint; begin
  v_cost := (select guest_points from public.courses order by id limit 1);
  v_allow := (select guest_allowance from public.club_settings where id = 1);
  perform t.act_as(998001);
  r := public.office_charge_guests(998002, null, '[{"name":"Sam Guest"},{"name":"Alex Moore"}]');
  reset role;
  select * into n from public.booking_notices where member_id = 998002 and kind = 'guests';
  perform t.ok('Guest notice: the member is told the points used and how many are left',
    n.points = 2 * v_cost and n.points_left = v_allow - 2 * v_cost and n.allowance = v_allow and n.with_names = array['Sam Guest', 'Alex Moore'] and n.date = public.club_today(),
    row_to_json(n)::text);
  perform t.act_as(998002);
  perform t.ok('Guest notice: the member can read it', exists (select 1 from public.booking_notices where kind = 'guests'));
  reset role;

  v_visit := (select id from public.guest_visits where member_id = 998002 and guest_name = 'Alex Moore');
  perform t.act_as(998001);
  perform public.office_remove_guest_charge(v_visit);
  reset role;
  perform t.ok('Guest notice: a charge taken off before it''s seen takes the notice with it',
    not exists (select 1 from public.booking_notices where member_id = 998002 and kind = 'guests' and not seen));
end $$;

select test, ok, detail from t.results order by n;
rollback;
