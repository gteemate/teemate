-- Database tests: friend contacts (other clubs) and favourites; each member's own. Rolled back.
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
create function t.id(p_k text) returns bigint language sql as $$ select id from t.ids where k = p_k $$;
grant execute on all functions in schema t to anon, authenticated;

insert into public.members (id, name) values (990801, 'Contact Owner'), (990802, 'Contact Other'), (990803, 'Contact Buddy');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'fc-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 3) i;
update public.members m set user_id = (select id from auth.users where email = 'fc-test-' || (m.id - 990800) || '@example.invalid') where m.id between 990801 and 990803;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;


insert into public.buddies (member_id, buddy_id) values (990801, 990803), (990802, 990803);

do $$ declare e text; c bigint; n int; begin
  perform t.act_as(990801);
  insert into public.friend_contacts (owner, name, club, hcp, gui, shared_on) values (990801, 'Sam Visitor', 'Other GC', '12.0', '555', current_date) returning id into c;
  perform t.ok('Owner saves a contact', exists (select 1 from public.friend_contacts where id = c));
  update public.friend_contacts set hcp = '11.4', favourite = true where id = c;
  perform t.ok('Owner updates it (and stars it)', (select hcp = '11.4' and favourite from public.friend_contacts where id = c));
  e := t.err(format('insert into public.friend_contacts (owner, name) values (990802, %L)', 'Sneaky'));
  perform t.ok('Can''t save a contact into someone else''s list', e is not null, e);
  e := t.err(format('insert into public.friend_contacts (owner, name) values (990801, %L)', repeat('a', 81)));
  perform t.ok('Names over 80 characters are refused', e is not null, e);
  update public.buddies set favourite = true where buddy_id = 990803;
  perform t.ok('Star a club friend', (select favourite from public.buddies where member_id = 990801 and buddy_id = 990803));
  reset role;
  perform t.ok('Only my own buddy row was starred', not (select favourite from public.buddies where member_id = 990802 and buddy_id = 990803));

  perform t.act_as(990802);
  perform t.ok('Another member can''t see my contacts', not exists (select 1 from public.friend_contacts where owner = 990801));
  update public.friend_contacts set name = 'Hacked' where id = c;
  delete from public.friend_contacts where id = c;
  reset role;
  perform t.ok('…or change or delete them', (select name = 'Sam Visitor' from public.friend_contacts where id = c));

  perform t.act_as(990801);
  delete from public.friend_contacts where id = c;
  reset role;
  perform t.ok('Owner removes it', not exists (select 1 from public.friend_contacts where id = c));

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  e := t.err('select count(*) from public.friend_contacts');
  perform t.ok('Visitors can''t read contacts', e is not null, e);
  reset role;
end $$;

select test, ok, detail from t.results order by n;
rollback;
