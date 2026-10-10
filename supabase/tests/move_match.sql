-- Database tests: moving a match's booking to another time on the day, in one step. Rolled back.
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
create function t.set(p_k text, p_id bigint) returns void language sql as $$ insert into t.ids values (p_k, p_id) on conflict (k) do update set id = excluded.id $$;
create function t.id(p_k text) returns bigint language sql as $$ select id from t.ids where k = p_k $$;
grant execute on all functions in schema t to anon, authenticated;

insert into public.members (id, name) values (991101, 'Move One'), (991102, 'Move Two'), (991103, 'Move Three'), (991104, 'Move Four'), (991105, 'Move Outsider');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'mv-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 5) i;
update public.members m set user_id = (select id from auth.users where email = 'mv-test-' || (m.id - 991100) || '@example.invalid') where m.id between 991101 and 991105;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;


update public.club_settings set release_days = 13, release_weekends_only = false where id = 1;
-- Tomorrow: the match's tee time (A), a free one (B), a full one (F); and one the day after (X).
with s as (insert into public.tee_slots (course_id, date, start_time) values (1, current_date + 1, 3), (1, current_date + 1, 303), (1, current_date + 1, 403), (1, current_date + 2, 3) returning id, date, start_time)
insert into t.ids select case when date = current_date + 2 then 'X' when start_time = 3 then 'A' when start_time = 303 then 'B' else 'F' end, id from s;
do $$ begin
  perform t.set('book', (public.book_as(991101, t.id('A'), '{991102,991103,991104}', '[]', false)->>'id')::bigint);
  perform public.book_as(991105, t.id('F'), '{}', '[{"name":"G1"},{"name":"G2"},{"name":"G3"}]', false);
end $$;

do $$ declare e text; j jsonb; begin
  perform t.act_as(991105);
  e := t.err(format('select public.move_match_booking(%s, %s)', t.id('book'), t.id('B')));
  perform t.ok('Someone not on the booking can''t move it', e is not null, e);
  reset role;

  perform t.act_as(991103); -- on the booking, didn't make it
  e := t.err(format('select public.move_match_booking(%s, %s)', t.id('book'), t.id('F')));
  perform t.ok('A full time: refused, and the match keeps its time', e is not null and (select count(*) from public.booking_players where slot_id = t.id('A')) = 4, e);
  e := t.err(format('select public.move_match_booking(%s, %s)', t.id('book'), t.id('X')));
  perform t.ok('Only to another time on the same day', e like '%same day%', e);
  j := public.move_match_booking(t.id('book'), t.id('B'));
  reset role;
  perform t.ok('Moved: all four on the new time, the old one empty, same person booked it',
    (select count(*) from public.booking_players where slot_id = t.id('B')) = 4 and (select count(*) from public.booking_players where slot_id = t.id('A')) = 0
    and (select booked_by from public.bookings where slot_id = t.id('B')) = 991101, j::text);

  -- A card started on the new time with hole 1 saved: it can't move again.
  insert into public.rounds (created_by, lineup, slot_id, scores, done, game)
    values (991101, '[{"m":991101},{"m":991102},{"m":991103},{"m":991104}]', t.id('B'), '[]', '[true]'::jsonb || (select jsonb_agg(false) from generate_series(1, 17)), 'stab');
  perform t.act_as(991101);
  e := t.err(format('select public.move_match_booking(%s, %s)', (select id from public.bookings where slot_id = t.id('B')), t.id('A')));
  perform t.ok('Once a hole is saved, the match can''t move', e like '%started%', e);
  reset role;
end $$;

select test, ok, detail from t.results order by n;
rollback;
