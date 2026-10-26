-- Database tests: data stamps — each kind's stamp moves when its tables change, and only then. Rolled back.
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

insert into public.members (id, name, hcp_index) values (0, 'Gary', 12.4) on conflict (id) do nothing;
insert into auth.users (id, email, aud, role) values (gen_random_uuid(), 'dv-test-0@example.invalid', 'authenticated', 'authenticated');
update public.members set user_id = (select id from auth.users where email = 'dv-test-0@example.invalid') where id = 0;

do $$ declare r record; before jsonb; after jsonb; moved text[]; e text;
begin
  for r in select * from (values ('members', 'members'), ('courses', 'course'), ('tees', 'course'), ('holes', 'course'), ('pin_sheets', 'pins'),
      ('game_settings', 'games'), ('game_prefs', 'games'), ('member_game_prefs', 'games'), ('events', 'events'), ('club_settings', 'club'),
      ('signup_comps', 'comps'), ('signup_entries', 'comps'), ('ko_matches', 'comps'), ('access_requests', 'requests'), ('tee_time_requests', 'requests'),
      ('buddies', 'friends'), ('friend_contacts', 'friends'), ('member_favourites', 'friends')) x(tbl, kind) loop
    select jsonb_object_agg(kind, changed_at) into before from public.data_versions;
    execute format('delete from public.%I where false', r.tbl);
    select jsonb_object_agg(kind, changed_at) into after from public.data_versions;
    select array_agg(k) into moved from jsonb_object_keys(after) k where after->k is distinct from before->k;
    perform t.ok(format('A change to %s moves the %s stamp, and only that', r.tbl, r.kind), moved = array[r.kind], array_to_string(moved, ','));
  end loop;
  select jsonb_object_agg(kind, changed_at) into before from public.data_versions;
  update public.members set name = name where id = 0;
  insert into public.events (name, start_date, style, fmt) values ('Stamp test', current_date + 3, 'individual', 'stab');
  select jsonb_object_agg(kind, changed_at) into after from public.data_versions;
  perform t.ok('Updates and inserts move stamps too', after->'members' is distinct from before->'members' and after->'events' is distinct from before->'events');
  perform t.ok('There is a stamp for every kind', (select count(*) from public.data_versions) = 9);
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = 0), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform t.ok('A member reads all the stamps', (select count(*) from jsonb_object_keys(public.data_versions())) = 9);
  reset role;
  execute 'set local role anon';
  e := t.err('select public.data_versions()');
  perform t.ok('A visitor can''t', e is not null, e);
  reset role;
end $$;

select test, ok, detail from t.results order by n;
rollback;
