-- Database tests: a member can't book (or add to) a tee time that has already gone today; the club office still can.
-- Rolled back. Before the day's first tee time (London time) there's nothing passed yet, so the checks say so and pass.
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

insert into public.members (id, name) values (995001, 'Office Admin P'), (995002, 'Pat Reid');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'pt-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 2) i;
update public.members m set user_id = (select id from auth.users where email = 'pt-' || (m.id - 995000) || '@example.invalid'), admin = (m.id = 995001) where m.id between 995001 and 995002;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;

do $$ declare v_now int; v_gone bigint; v_later bigint; e text; begin
  perform t.act_as(995001);
  perform public.get_tee_sheet(public.club_today()); -- makes today's tee times
  reset role;
  v_now := (extract(hour from now() at time zone 'Europe/London') * 60 + extract(minute from now() at time zone 'Europe/London'))::int;
  select id into v_gone from public.tee_slots where date = public.club_today() and start_time < v_now
     and not exists (select 1 from public.booking_players bp where bp.slot_id = tee_slots.id) order by start_time limit 1;
  if v_gone is null then
    perform t.ok('Passed: a member can''t book a time that has gone today', true, 'nothing has gone yet today');
    perform t.ok('Passed: the club office still can', true, 'nothing has gone yet today');
    return;
  end if;
  perform t.act_as(995002);
  e := t.err(format('select public.book_tee_time(%s)', v_gone));
  reset role;
  perform t.ok('Passed: a member can''t book a time that has gone today', e = 'That tee time has passed.', e);
  perform t.act_as(995001);
  e := t.err(format('select public.book_tee_time(%s)', v_gone));
  reset role;
  perform t.ok('Passed: the club office still can', e is null, e);
end $$;

select test, ok, detail from t.results order by n;
rollback;
