-- Database tests: paper scorecards. The office switch, the daily read limit, marking a card as read from paper, and
-- who may confirm, send back and resend the uploader's score. Rolled back.
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

-- 991101 office, 991102 Alex (uploads), 991103 Chris, 991104 Jo (on the card), 991105 Sam (not on it)
insert into public.members (id, name) values (991101, 'Office P'), (991102, 'Alex Paper'), (991103, 'Chris Paper'), (991104, 'Jo Paper'), (991105, 'Sam Paper');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'pc-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 5) i;
update public.members m set user_id = (select id from auth.users where email = 'pc-' || (m.id - 991100) || '@example.invalid'), admin = (m.id = 991101) where m.id between 991101 and 991105;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;

do $$ declare e text; v_r bigint; v_list jsonb; i int; begin
  insert into public.rounds (created_by, lineup, scores, done) values (991102, '[{"m":991102},{"m":991103},{"m":991104}]', '[]', '[]') returning id into v_r;
  update public.club_settings set paper_cards = false where id = 1;

  -- The office switch
  perform t.act_as(991102);
  e := t.err('select public.admin_set_paper_cards(true)');
  perform t.ok('Only the club office can switch paper scorecards on', e like '%Only the club office%', e);
  e := t.err('select public.take_paper_read()');
  perform t.ok('No reads while it is switched off', e = 'Paper scorecards are switched off at this club.', e);
  reset role;
  perform t.act_as(991101);
  perform public.admin_set_paper_cards(true);
  perform t.ok('The theme says it is on', (public.get_theme()->>'paperCards')::boolean);
  reset role;

  -- The daily limit
  perform t.act_as(991102);
  for i in 1..10 loop perform public.take_paper_read(); end loop;
  e := t.err('select public.take_paper_read()');
  perform t.ok('Ten reads a day, then a plain refusal', e = 'You''ve read 10 cards today. Enter the scores by hand, or try again tomorrow.', e);
  reset role;
  perform t.act_as(991103);
  perform t.ok('The limit is per member', t.err('select public.take_paper_read()') is null);
  reset role;

  -- Marking the card as read from paper
  perform t.act_as(991102);
  e := t.err(format('select public.mark_paper_card(%s, 2, 991105)', v_r));
  perform t.ok('The confirmer must be on the card', e like '%on this card%', e);
  e := t.err(format('select public.mark_paper_card(%s, 2, 991102)', v_r));
  perform t.ok('You can''t confirm your own score', e like '%your own%', e);
  reset role;
  perform t.act_as(991105);
  e := t.err(format('select public.mark_paper_card(%s, 2, 991103)', v_r));
  perform t.ok('Only players on the card can mark it', e like '%on this card%', e);
  reset role;
  perform t.act_as(991102);
  perform public.mark_paper_card(v_r, 2, 991103);
  e := t.err(format('update public.rounds set paper_state = ''confirmed'' where id = %s', v_r));
  perform t.ok('Players can''t change the confirmation by editing the card', e like '%confirm%', e);
  reset role;
  perform t.ok('The card is marked: Alex uploaded, Chris to confirm, waiting, 2 photos',
    (select paper_by = 991102 and paper_confirmer = 991103 and paper_state = 'waiting' and paper_photos = 2 from public.rounds where id = v_r));

  -- Confirming
  perform t.act_as(991103);
  v_list := public.my_paper_confirms();
  perform t.ok('Chris has it in his list', jsonb_array_length(v_list) = 1 and (v_list->0->>'id')::bigint = v_r, v_list::text);
  reset role;
  perform t.act_as(991104);
  e := t.err(format('select public.confirm_paper_score(%s)', v_r));
  perform t.ok('Another player on the card can''t confirm it', e like '%confirm%', e);
  perform t.ok('Jo''s list is empty', jsonb_array_length(public.my_paper_confirms()) = 0);
  reset role;
  perform t.act_as(991102);
  e := t.err(format('select public.confirm_paper_score(%s)', v_r));
  perform t.ok('Alex can''t confirm his own', e like '%confirm%', e);
  reset role;

  -- Sent back, fixed, resent, confirmed
  perform t.act_as(991103);
  e := t.err(format('select public.send_back_paper_score(%s, '' '')', v_r));
  perform t.ok('Sending back needs a note', e like '%note%', e);
  perform public.send_back_paper_score(v_r, 'Hole 14 was a 6');
  reset role;
  perform t.ok('Sent back with the note', (select paper_state = 'sent_back' and paper_note = 'Hole 14 was a 6' from public.rounds where id = v_r));
  perform t.act_as(991103);
  e := t.err(format('select public.resend_paper_score(%s)', v_r));
  perform t.ok('Only the uploader can resend', e like '%uploaded%', e);
  reset role;
  perform t.act_as(991102);
  perform public.resend_paper_score(v_r);
  reset role;
  perform t.act_as(991103);
  perform public.confirm_paper_score(v_r);
  reset role;
  perform t.ok('Confirmed, and the note is cleared', (select paper_state = 'confirmed' and paper_note is null from public.rounds where id = v_r));

  -- The office can always confirm, and sees the cards left for it
  perform set_config('teemate.paper', 'on', true); -- test setup only
  update public.rounds set paper_state = 'waiting', paper_confirmer = null where id = v_r;
  perform set_config('teemate.paper', '', true);
  perform t.act_as(991101);
  v_list := public.my_paper_confirms();
  perform t.ok('The office lists cards left for the office', jsonb_array_length(v_list) = 1, v_list::text);
  reset role;
  perform set_config('teemate.paper', 'on', true);
  update public.rounds set paper_state = 'waiting', paper_confirmer = 991103 where id = v_r;
  perform set_config('teemate.paper', '', true);
  perform t.act_as(991101);
  perform public.confirm_paper_score(v_r);
  reset role;
  perform t.ok('The office can confirm even when a player was picked', (select paper_state = 'confirmed' from public.rounds where id = v_r));

  -- Found in review: a confirmed card can't be marked again
  perform t.act_as(991102);
  e := t.err(format('select public.mark_paper_card(%s, 1, 991104)', v_r));
  perform t.ok('A confirmed card can''t be marked again', e like '%already confirmed%', e);
  reset role;

  -- Found in review: the player asked leaves the card; the office sees it and can confirm, they can't
  perform set_config('teemate.paper', 'on', true);
  update public.rounds set paper_state = 'waiting', paper_confirmer = 991104 where id = v_r;
  perform set_config('teemate.paper', '', true);
  update public.rounds set lineup = '[{"m":991102},{"m":991103}]' where id = v_r;
  perform t.act_as(991104);
  perform t.ok('Someone taken off the card no longer has it to confirm', jsonb_array_length(public.my_paper_confirms()) = 0);
  e := t.err(format('select public.confirm_paper_score(%s)', v_r));
  perform t.ok('…and can''t confirm it', e like '%confirm%', e);
  reset role;
  perform t.act_as(991101);
  v_list := public.my_paper_confirms();
  perform t.ok('The office sees it, marked for the office', (select bool_or((x->>'id')::bigint = v_r and (x->>'forOffice')::boolean) from jsonb_array_elements(v_list) x), v_list::text);
  reset role;

  -- Found in review: a read is only counted once the card has been read
  perform t.act_as(991104);
  perform public.can_read_paper();
  perform public.can_read_paper();
  reset role;
  perform t.ok('Checking the limit doesn''t use a read', not exists (select 1 from public.paper_reads where member_id = 991104 and n > 0));
  perform t.act_as(991102);
  e := t.err('select public.can_read_paper()');
  perform t.ok('The limit check refuses after 10', e like '%read 10 cards today%', e);
  reset role;

  -- Found in review: deleting a member who uploaded or was asked to confirm a card
  perform set_config('teemate.paper', 'on', true);
  update public.rounds set lineup = '[{"m":991102},{"m":991103},{"m":991104}]', paper_confirmer = 991104 where id = v_r;
  perform set_config('teemate.paper', '', true);
  perform t.act_as(991101);
  e := t.err('select public.admin_delete_member(991104)');
  reset role;
  perform t.ok('The office can delete a member who was asked to confirm a card', e is null, e);
  perform t.ok('…and the card is left for the office', (select paper_confirmer is null from public.rounds where id = v_r));

  -- Photos: players on the card and the office, nobody else
  perform t.ok('The scorecards bucket is private', (select not public from storage.buckets where id = 'scorecards'));
  insert into storage.objects (bucket_id, name, owner) values ('scorecards', v_r || '/1.jpg', null);
  perform t.act_as(991103);
  perform t.ok('A player on the card can see its photo', (select count(*) from storage.objects where bucket_id = 'scorecards' and name = v_r || '/1.jpg') = 1);
  reset role;
  perform t.act_as(991105);
  perform t.ok('Someone not on the card can''t', (select count(*) from storage.objects where bucket_id = 'scorecards' and name = v_r || '/1.jpg') = 0);
  reset role;
  perform t.act_as(991101);
  perform t.ok('The office can', (select count(*) from storage.objects where bucket_id = 'scorecards' and name = v_r || '/1.jpg') = 1);
  reset role;
end $$;

select test, ok, detail from t.results order by n;
rollback;
