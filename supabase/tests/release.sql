-- Database tests: tee time release (when a day's tee times open for booking). Rolled back.
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

-- Test members of their own: an admin, a member and the member's buddy.
insert into public.members (id, name) values (990201, 'Release Admin'), (990202, 'Release Member'), (990203, 'Release Buddy');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'release-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 3) i;
update public.members m set user_id = (select id from auth.users where email = 'release-test-' || (m.id - 990200) || '@example.invalid'), admin = (m.id = 990201)
 where m.id between 990201 and 990203;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;
-- Tee times of their own 9 days ahead (not open under the default rule until 8pm tomorrow).
create table t.slot (k text primary key, id bigint);
with s as (insert into public.tee_slots (course_id, date, start_time) values (1, current_date + 9, 5), (1, current_date + 9, 200), (1, current_date + 9, 400) returning id, start_time)
insert into t.slot select 'a' || start_time, id from s;
grant select on t.slot to authenticated;
-- Start from the defaults, whatever the live club has set.
update public.club_settings set release_time = '20:00', release_days = 8, release_weekends_only = false where id = 1;

do $$ declare e text; r jsonb; begin
  -- the moment a day opens, on UK time either side of the clocks going back (Sun 25 Oct 2026)
  perform t.ok('Opens: Sat 31 Oct opens Fri 23 Oct 8pm BST (19:00 UTC)', public.tee_time_opens_at('2026-10-31') = '2026-10-23 19:00+00', public.tee_time_opens_at('2026-10-31')::text);
  perform t.ok('Opens: Sat 7 Nov opens Fri 30 Oct 8pm GMT (20:00 UTC)', public.tee_time_opens_at('2026-11-07') = '2026-10-30 20:00+00', public.tee_time_opens_at('2026-11-07')::text);

  update public.club_settings set release_weekends_only = true where id = 1;
  perform t.ok('Weekends only: a Wednesday is always open', public.tee_time_opens_at('2026-10-28') is null);
  perform t.ok('Weekends only: a Sunday still has a release', public.tee_time_opens_at('2026-11-01') = '2026-10-24 19:00+00', public.tee_time_opens_at('2026-11-01')::text);
  update public.club_settings set release_weekends_only = false where id = 1;

  perform t.act_as(990202);
  r := public.get_booking_rules();
  perform t.ok('Rules: members read them', r->>'time' = '20:00' and (r->>'days')::int = 8 and not (r->>'weekendsOnly')::boolean and r ? 'now', r::text);
  e := t.err(format('select public.book_tee_time(%s)', (select id from t.slot where k = 'a5')));
  perform t.ok('Before release: a member is refused, with when it opens', e like 'Tee times for % open at 8pm on %.', e);
  e := t.err(format('select public.book_tee_time(%s, ''{990203}'')', (select id from t.slot where k = 'a200')));
  perform t.ok('Before release: booking a buddy is refused too', e like 'Tee times for %', e);
  e := t.err($q$select public.admin_set_booking_rules('19:00', 8, false)$q$);
  perform t.ok('Rules: members can''t change them', e like '%Only admins%', e);
  reset role;

  perform t.act_as(990201);
  r := public.book_tee_time((select id from t.slot where k = 'a400'));
  perform t.ok('Before release: an admin can still book (competitions, societies)', r ? 'id', r::text);
  e := t.err($q$select public.admin_set_booking_rules('20:00', 0, false)$q$);
  perform t.ok('Rules: 0 days ahead refused', e like '%1 and 13%', e);
  e := t.err($q$select public.admin_set_booking_rules('20:00', 14, false)$q$);
  perform t.ok('Rules: 14 days ahead refused', e like '%1 and 13%', e);
  perform public.admin_set_booking_rules('20:30', 13, false);
  r := public.get_booking_rules();
  perform t.ok('Rules: admin changes them', r->>'time' = '20:30' and (r->>'days')::int = 13, r::text);
  reset role;

  perform t.act_as(990202);
  r := public.book_tee_time((select id from t.slot where k = 'a5'));
  perform t.ok('After release (13 days ahead now): the member books', r ? 'id', r::text);
  perform t.ok('Tee sheet: 13 days ahead has tee times', jsonb_array_length(public.get_tee_sheet(current_date + 13)) > 0);
  reset role;

  -- release set to this very minute, UK time: the day is open (opens <= now), and a minute later it isn't
  update public.club_settings set release_time = date_trunc('minute', now() at time zone 'Europe/London')::time, release_days = 9 where id = 1;
  perform t.ok('Exactly at the release moment the day is open', public.tee_time_opens_at((now() at time zone 'Europe/London')::date + 9) <= now(),
    public.tee_time_opens_at((now() at time zone 'Europe/London')::date + 9)::text);

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  e := t.err($q$select public.admin_set_booking_rules('20:00', 8, false)$q$);
  perform t.ok('Rules: visitors can''t change them', e is not null, e);
  e := t.err($q$select public.get_booking_rules()$q$);
  perform t.ok('Rules: visitors can''t read them (members only)', e is not null, e);
  reset role;
end $$;

select test, ok, detail from t.results order by n;
rollback;
