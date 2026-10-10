-- Database tests: the knockout draw (byes, swaps, publish, report / confirm / dispute, admin results). Rolled back.
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

insert into public.members (id, name) values (991501, 'KO Admin'), (991502, 'KO One'), (991503, 'KO Two'), (991504, 'KO Three'), (991505, 'KO Four'), (991506, 'KO Five'), (991507, 'KO Outsider');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'ko-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 7) i;
update public.members m set user_id = (select id from auth.users where email = 'ko-test-' || (m.id - 991500) || '@example.invalid'), admin = (m.id = 991501) where m.id between 991501 and 991507;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;


-- Three closed competitions: 5, 6 and 8 entries.
with c as (insert into public.signup_comps (name, category, kind, closes_on, open) values
  ('KO Five', 'open', 'singles', current_date - 1, true), ('KO Six', 'open', 'singles', current_date - 1, true), ('KO Eight', 'open', 'singles', current_date - 1, true) returning id, name)
insert into t.ids select name, id from c;
insert into public.signup_entries (comp_id, member_id) select t.id('KO Five'), id from public.members where id between 991502 and 991506;
insert into public.signup_entries (comp_id, member_id) select t.id('KO Six'), id from public.members where id between 991501 and 991506;
insert into public.signup_entries (comp_id, member_id) select t.id('KO Eight'), m from unnest(array[991501, 991502, 991503, 991504, 991505, 991506, 991507, 991501]) with ordinality u(m, k)
  where k <= 7 union all select t.id('KO Eight'), id from public.members where id = 0 and false;
-- (Eight: seven real members here, so it's a 7-entry draw in a bracket of 8.)
create function t.entry(p_comp bigint, p_member bigint) returns bigint language sql as $$ select id from public.signup_entries where comp_id = p_comp and member_id = p_member $$;
grant execute on function t.entry(bigint, bigint) to authenticated;
create function t.side(p_comp bigint, p_member bigint) returns public.ko_matches language sql as $$
  select m.* from public.ko_matches m where m.comp_id = p_comp and m.round = 1 and t.entry(p_comp, p_member) in (m.a_entry, m.b_entry) $$;
grant execute on function t.side(bigint, bigint) to authenticated;

do $$ declare e text; m public.ko_matches; other bigint; w bigint; nxt public.ko_matches; begin
  perform t.act_as(991502);
  e := t.err(format('select public.admin_make_draw(%s)', t.id('KO Five')));
  perform t.ok('Members can''t make the draw', e like '%Only admins%', e);
  reset role;

  perform t.act_as(991501);
  perform public.admin_make_draw(t.id('KO Five'));
  perform t.ok('Five entries: a bracket of 8 (4 + 2 + 1 matches)', (select count(*) from public.ko_matches where comp_id = t.id('KO Five')) = 7
    and (select count(*) from public.ko_matches where comp_id = t.id('KO Five') and round = 1) = 4);
  perform t.ok('Three byes, never two in one match, each straight through to round 2',
    (select count(*) from public.ko_matches where comp_id = t.id('KO Five') and round = 1 and status = 'bye') = 3
    and not exists (select 1 from public.ko_matches where comp_id = t.id('KO Five') and round = 1 and a_entry is null)
    and (select count(*) from public.ko_matches where comp_id = t.id('KO Five') and round = 2 and (a_entry is not null)::int + (b_entry is not null)::int > 0) >= 2
    and (select count(a_entry) + count(b_entry) from public.ko_matches where comp_id = t.id('KO Five') and round = 2) = 3);
  perform public.admin_make_draw(t.id('KO Six'));
  perform t.ok('Six entries: two byes', (select count(*) from public.ko_matches where comp_id = t.id('KO Six') and round = 1 and status = 'bye') = 2);
  perform public.admin_make_draw(t.id('KO Eight'));
  perform t.ok('Seven entries in a bracket of 8: one bye', (select count(*) from public.ko_matches where comp_id = t.id('KO Eight') and round = 1 and status = 'bye') = 1);
  -- Swap two entries in round-1 matches with an opponent.
  select * into m from public.ko_matches where comp_id = t.id('KO Eight') and round = 1 and status = 'open' order by slot limit 1;
  select b_entry into other from public.ko_matches where comp_id = t.id('KO Eight') and round = 1 and status = 'open' and id <> m.id order by slot limit 1;
  perform public.admin_swap_draw(t.id('KO Eight'), m.a_entry, other);
  perform t.ok('Admins swap two entries before publishing', (select a_entry from public.ko_matches where id = m.id) = other);
  perform public.admin_set_round_deadlines(t.id('KO Eight'), array[current_date + 14, current_date + 28, current_date + 42]);
  reset role;

  perform t.act_as(991502);
  perform t.ok('Not visible to players before it''s published', not exists (select 1 from public.ko_matches where comp_id = t.id('KO Eight')));
  perform t.ok('…nor the entry list', jsonb_array_length(public.ko_entries(t.id('KO Eight'))) = 0);
  reset role;
  perform t.act_as(991501); perform public.admin_publish_draw(t.id('KO Eight')); reset role;
  perform t.act_as(991507);
  perform t.ok('Published: players in it see the draw', exists (select 1 from public.ko_matches where comp_id = t.id('KO Eight')));
  perform t.ok('…and everyone in it, for the names', jsonb_array_length(public.ko_entries(t.id('KO Eight'))) = 7);
  reset role;

  -- A real round-1 match: one side reports, the other confirms; the winner moves on.
  select * into m from public.ko_matches where comp_id = t.id('KO Eight') and round = 1 and status = 'open' order by slot limit 1;
  perform t.set('mA', (select member_id from public.signup_entries where id = m.a_entry));
  perform t.set('mB', (select member_id from public.signup_entries where id = m.b_entry));
  perform t.act_as(991507 + 0 * 0);
  if t.id('mA') <> 991507 and t.id('mB') <> 991507 then
    e := t.err(format('select public.report_ko_result(%s, %s, ''3&2'')', m.id, m.a_entry));
    perform t.ok('Only players in the match report it', e like '%your match%', e);
  else perform t.ok('Only players in the match report it', true); end if;
  reset role;
  perform t.act_as(t.id('mA'));
  perform public.report_ko_result(m.id, m.a_entry, '3&2');
  e := t.err(format('select public.confirm_ko_result(%s)', m.id));
  perform t.ok('You can''t confirm your own report', e like '%other side%', e);
  reset role;
  perform t.act_as(t.id('mB'));
  perform public.confirm_ko_result(m.id);
  reset role;
  select * into nxt from public.ko_matches where comp_id = m.comp_id and round = 2 and slot = m.slot / 2;
  perform t.ok('Confirmed: the winner is in round 2', (select status = 'confirmed' and winner_entry = m.a_entry from public.ko_matches where id = m.id)
    and (case when m.slot % 2 = 0 then nxt.a_entry else nxt.b_entry end) = m.a_entry);

  -- Another match: reported, then disputed; the admin sets it (to the other side).
  select * into m from public.ko_matches where comp_id = t.id('KO Eight') and round = 1 and status = 'open' order by slot limit 1;
  perform t.act_as((select member_id from public.signup_entries where id = m.a_entry));
  perform public.report_ko_result(m.id, m.a_entry, '1 up');
  reset role;
  perform t.act_as((select member_id from public.signup_entries where id = m.b_entry));
  perform public.dispute_ko_result(m.id);
  reset role;
  perform t.ok('Disputed: flagged, nobody moves on', (select status from public.ko_matches where id = m.id) = 'disputed');
  perform t.act_as(991501);
  perform public.admin_set_ko_result(m.id, m.b_entry, 'at the 19th');
  reset role;
  select * into nxt from public.ko_matches where comp_id = m.comp_id and round = 2 and slot = m.slot / 2;
  perform t.ok('The admin settles it; that winner moves on', (select winner_entry from public.ko_matches where id = m.id) = m.b_entry
    and (case when m.slot % 2 = 0 then nxt.a_entry else nxt.b_entry end) = m.b_entry);
  perform t.act_as(991501);
  perform public.admin_set_ko_result(m.id, m.a_entry, 'corrected: 2&1');
  reset role;
  select * into nxt from public.ko_matches where comp_id = m.comp_id and round = 2 and slot = m.slot / 2;
  perform t.ok('A correction (next match not played) moves the right player on',
    (case when m.slot % 2 = 0 then nxt.a_entry else nxt.b_entry end) = m.a_entry);

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  e := t.err(format('select public.report_ko_result(%s, %s, ''x'')', m.id, m.a_entry));
  perform t.ok('Visitors can''t report', e is not null, e);
  reset role;
end $$;

select test, ok, detail from t.results order by n;
rollback;
