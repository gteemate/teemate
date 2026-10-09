-- Database tests: deleting a booking that has scores (only when confirmed), and anyone on a card can delete it. Rolled back.
begin;
create schema t;
create table t.results (n serial, test text, ok boolean, detail text);
create table t.ids (k text primary key, id bigint);
grant usage on schema t to anon, authenticated;
grant all on all tables in schema t to anon, authenticated;
grant all on all sequences in schema t to anon, authenticated;
create function t.ok(p_test text, p_ok boolean, p_detail text default null) returns void language sql as $$
  insert into t.results (test, ok, detail) values (p_test, coalesce(p_ok, false), p_detail) $$;
create function t.id(p_k text) returns bigint language sql as $$ select id from t.ids where k = p_k $$;
grant execute on all functions in schema t to anon, authenticated;

insert into public.members (id, name) values (990601, 'Card Booker'), (990602, 'Card Buddy'), (990603, 'Card Outsider');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'carddel-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 3) i;
update public.members m set user_id = (select id from auth.users where email = 'carddel-test-' || (m.id - 990600) || '@example.invalid') where m.id between 990601 and 990603;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;

-- Three of today's tee times, each booked by the booker with the buddy, each with a group card started by the buddy
-- with hole 1 saved (A: delete without confirming, B: delete confirmed, C: delete the card on its own).
with s as (insert into public.tee_slots (course_id, date, start_time) values (1, current_date, 2), (1, current_date, 200), (1, current_date, 400) returning id, start_time)
insert into t.ids select case start_time when 2 then 'slotA' when 200 then 'slotB' else 'slotC' end, id from s;
do $$ declare k text; begin
  foreach k in array array['A', 'B', 'C'] loop
    perform t.ok('setup', public.book_as(990601, t.id('slot' || k), '{990602}', '[]', false) ? 'id');
    insert into t.ids select 'book' || k, id from public.bookings where slot_id = t.id('slot' || k);
    with r as (insert into public.rounds (created_by, lineup, slot_id, scores, done, game)
      values (990602, '[{"m":990602},{"m":990601}]', t.id('slot' || k), (select jsonb_agg('[4,4]'::jsonb) from generate_series(1, 18)),
              '[true]'::jsonb || (select jsonb_agg(false) from generate_series(1, 17)), 'stab') returning id)
    insert into t.ids select 'card' || k, id from r;
  end loop;
end $$;
delete from t.results where test = 'setup';

do $$ declare j jsonb; begin
  perform t.act_as(990601);
  j := public.get_my_bookings();
  perform t.ok('Bookings list: says how many holes have been scored on the tee time''s card',
    (select (x->>'scoredHoles')::int from jsonb_array_elements(j) x where (x->>'id')::bigint = t.id('bookA')) = 1, j::text);
  perform public.cancel_booking(t.id('bookA'));
  perform t.ok('Delete without confirming: the scores stay (as before)', exists (select 1 from public.rounds where id = t.id('cardA')));
  j := public.cancel_booking(t.id('bookB'), true);
  perform t.ok('Delete confirmed: the scorecard goes too', not exists (select 1 from public.rounds where id = t.id('cardB')) and (j->>'cardsRemoved')::int = 1, j::text);
  reset role;

  perform t.act_as(990603); -- not on the card
  delete from public.rounds where id = t.id('cardC');
  reset role;
  perform t.ok('Delete a card: not by someone who isn''t on it', exists (select 1 from public.rounds where id = t.id('cardC')));
  perform t.act_as(990601); -- on the card, but the buddy started it
  delete from public.rounds where id = t.id('cardC');
  reset role;
  perform t.ok('Delete a card: anyone on it can, even if someone else started it', not exists (select 1 from public.rounds where id = t.id('cardC')));
end $$;

select test, ok, detail from t.results order by n;
rollback;
