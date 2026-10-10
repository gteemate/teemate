-- Database tests: sign-up competitions (men/ladies/mixed/open, singles/pairs, entries close). Rolled back.
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

insert into public.members (id, name) values (991401, 'Sign Admin'), (991402, 'Sign Man'), (991403, 'Sign Man Two'), (991404, 'Sign Lady'), (991405, 'Sign Lady Two'), (991406, 'Sign Unset');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'sign-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 6) i;
update public.members m set user_id = (select id from auth.users where email = 'sign-test-' || (m.id - 991400) || '@example.invalid'), admin = (m.id = 991401) where m.id between 991401 and 991406;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;


update public.members set plays_in = case when id in (991401, 991402, 991403) then 'men' when id in (991404, 991405) then 'ladies' end where id between 991401 and 991406;
with c as (insert into public.signup_comps (name, category, kind, closes_on, open) values
  ('T Mens Singles', 'men', 'singles', current_date + 10, true), ('T Mens Pairs', 'men', 'pairs', current_date + 10, true),
  ('T Mixed Pairs', 'mixed', 'pairs', current_date + 10, true), ('T Closed', 'open', 'singles', current_date - 1, true),
  ('T Hidden', 'open', 'singles', current_date + 10, false), ('T Open Singles', 'open', 'singles', current_date + 10, true) returning id, name)
insert into t.ids select name, id from c;

do $$ declare e text; begin
  perform t.act_as(991402);
  perform public.enter_signup(t.id('T Mens Singles'), null);
  perform t.ok('Men''s singles: a man enters', exists (select 1 from public.signup_entries where comp_id = t.id('T Mens Singles') and member_id = 991402));
  e := t.err(format('select public.enter_signup(%s, null)', t.id('T Mens Singles')));
  perform t.ok('Not twice', e like '%already%', e);
  e := t.err(format('select public.enter_signup(%s, 991404)', t.id('T Mens Pairs')));
  perform t.ok('Men''s pairs: a lady partner refused', e like '%eligible%', e);
  perform public.enter_signup(t.id('T Mens Pairs'), 991403);
  perform t.ok('Men''s pairs: with a man', exists (select 1 from public.signup_entries where comp_id = t.id('T Mens Pairs') and member_id = 991402 and partner_id = 991403));
  e := t.err(format('select public.enter_signup(%s, 991403)', t.id('T Mixed Pairs')));
  perform t.ok('Mixed pairs: two men refused', e like '%one man and one lady%', e);
  perform public.enter_signup(t.id('T Mixed Pairs'), 991404);
  perform t.ok('Mixed pairs: a man and a lady', exists (select 1 from public.signup_entries where comp_id = t.id('T Mixed Pairs') and partner_id = 991404));
  e := t.err(format('select public.enter_signup(%s, null)', t.id('T Closed')));
  perform t.ok('Entries closed: refused', e like '%closed%', e);
  e := t.err(format('select public.enter_signup(%s, null)', t.id('T Hidden')));
  perform t.ok('Not open yet: refused', e is not null, e);
  e := t.err(format('select public.enter_signup(%s, 991405)', t.id('T Mens Singles')));
  perform t.ok('Singles: no partner', e is not null, e);
  reset role;

  perform t.act_as(991403); -- already someone's partner
  e := t.err(format('select public.enter_signup(%s, 991401)', t.id('T Mens Pairs')));
  perform t.ok('Already in as someone''s partner: refused', e like '%already%', e);
  perform t.ok('A partner sees the entry', exists (select 1 from public.signup_entries where comp_id = t.id('T Mens Pairs') and partner_id = 991403));
  perform public.withdraw_signup(t.id('T Mens Pairs'));
  perform t.ok('The partner withdraws: the pair is out', not exists (select 1 from public.signup_entries where comp_id = t.id('T Mens Pairs')));
  reset role;

  perform t.act_as(991406); -- no section set
  perform public.enter_signup(t.id('T Open Singles'), null);
  perform t.ok('Open: anyone, even with no section set', exists (select 1 from public.signup_entries where comp_id = t.id('T Open Singles') and member_id = 991406));
  e := t.err(format('select public.enter_signup(%s, null)', t.id('T Mens Singles')));
  perform t.ok('Men''s: refused until you set your section', e like '%Men''s or Ladies''%', e);
  perform t.ok('Hidden competitions aren''t visible to members', not exists (select 1 from public.signup_comps where id = t.id('T Hidden')));
  perform public.set_my_plays_in('ladies');
  perform t.ok('Members set their own section', (select plays_in from public.members where id = 991406) = 'ladies');
  e := t.err('update public.members set plays_in = ''men'' where id = 991402');
  perform t.ok('…and nobody else''s', (select plays_in from public.members where id = 991402) = 'men', e);
  e := t.err('insert into public.signup_comps (name, category, kind) values (''Mine'', ''open'', ''singles'')');
  perform t.ok('Members can''t add competitions', e is not null, e);
  reset role;

  perform t.act_as(991401);
  perform t.ok('Admins see hidden ones and every entry', exists (select 1 from public.signup_comps where id = t.id('T Hidden'))
    and (select count(*) from public.signup_entries where comp_id = t.id('T Mixed Pairs')) = 1);
  perform public.admin_set_plays_in(991406, 'men');
  perform t.ok('Admins correct a member''s section', (select plays_in from public.members where id = 991406) = 'men');
  reset role;

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  e := t.err(format('select public.enter_signup(%s, null)', t.id('T Open Singles')));
  perform t.ok('Visitors can''t enter', e is not null, e);
  reset role;
end $$;

select test, ok, detail from t.results order by n;
rollback;
