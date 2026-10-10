-- Database tests: club competitions run from templates; members' No thanks. Rolled back.
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

insert into public.members (id, name, plays_in) values (991201, 'Tpl Admin', 'men'), (991202, 'Tpl Member', 'men'), (991203, 'Tpl Other', 'men');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'tpl-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 3) i;
update public.members m set user_id = (select id from auth.users where email = 'tpl-' || (m.id - 991200) || '@example.invalid'), admin = (m.id = 991201) where m.id between 991201 and 991203;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;
create table t.c (id bigint);
grant all on t.c to authenticated;

do $$ declare c bigint; e text; ea bigint; eb bigint; begin
  -- Last season's: entries, a draw, a no-thanks.
  insert into public.signup_comps (name, category, kind, closes_on, open, draw_published, round_deadlines) values ('Tpl Match Play', 'men', 'singles', '2025-09-01', false, true, array['2025-10-01']::date[]) returning id into c;
  insert into t.c values (c);
  insert into public.signup_entries (comp_id, member_id) values (c, 991202) returning id into ea;
  insert into public.signup_entries (comp_id, member_id) values (c, 991203) returning id into eb;
  insert into public.ko_matches (comp_id, round, slot, a_entry, b_entry, winner_entry, status) values (c, 1, 0, ea, eb, ea, 'confirmed');
  insert into public.signup_declines (comp_id, member_id) values (c, 991201);

  perform t.act_as(991202);
  e := t.err(format('select public.admin_run_signup(%s, current_date + 10, current_date + 60)', c));
  perform t.ok('Members can''t run club competitions', e like '%Only the club office%', e);
  reset role;

  perform t.act_as(991201);
  e := t.err(format('select public.admin_run_signup(%s, current_date + 10, current_date + 5)', c));
  perform t.ok('The final has to be after entries close', e like '%after entries close%', e);
  perform public.admin_run_signup(c, current_date + 10, current_date + 60, 16, ' £5 a head ', 500);
  reset role;
  perform t.ok('Running it opens it with the new dates, limit and notes, and no draw',
    (select open and closes_on = current_date + 10 and final_by = current_date + 60 and max_entries = 16 and notes = '£5 a head' and entry_fee_pence = 500 and not draw_published and round_deadlines = '{}' from public.signup_comps where id = c));
  perform t.ok('Last time''s entries, draw and answers are cleared',
    not exists (select 1 from public.signup_entries where comp_id = c) and not exists (select 1 from public.ko_matches where comp_id = c) and not exists (select 1 from public.signup_declines where comp_id = c));

  perform t.act_as(991202);
  perform public.decline_signup(c);
  perform t.ok('A member says No thanks, and sees it (with the competition''s columns the app reads)',
    (select count(*) from public.signup_declines where comp_id = c) = 1
    and t.err('select id, name, category, kind, closes_on, notes, open, draw_published, round_deadlines, max_entries, created_by, final_by from public.signup_comps') is null);
  perform public.undecline_signup(c);
  perform t.ok('…and can take it back', not exists (select 1 from public.signup_declines where comp_id = c));
  perform public.decline_signup(c);
  reset role;
  perform t.act_as(991203);
  perform t.ok('Members only see their own No thanks', (select count(*) from public.signup_declines) = 0);
  reset role;

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  e := t.err(format('select public.decline_signup(%s)', c));
  perform t.ok('Visitors can''t call it', e like '%permission denied%', e);
  reset role;
end $$;

select test, ok, detail from t.results order by n;
rollback;
