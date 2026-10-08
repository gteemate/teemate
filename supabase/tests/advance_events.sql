-- Database tests: events set up in advance (who sees, creates and changes them). Rolled back.
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
create function t.val(p_sql text) returns bigint language plpgsql as $$ declare v bigint; begin execute p_sql into v; return v; end $$;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function t.done() returns void language plpgsql as $$ begin reset role; end $$;
grant execute on all functions in schema t to anon, authenticated;

insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'ev-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(0, 4) i;
update public.members m set user_id = (select id from auth.users where email = 'ev-test-' || m.id || '@example.invalid') where m.id between 0 and 4;
update public.members set admin = (id = 0) where id between 0 and 4;
create table t.ev (k text primary key, id bigint);
grant all on t.ev to authenticated;

do $$ declare e text; v bigint; begin
  perform t.act_as(1); -- Declan, an ordinary member
  insert into public.events (name, start_date, days, style, fmt, players, team, matches)
    values ('Declan''s Cup', current_date + 3, 2, 'ryder', 'bbl', '{1,2,3,4}', '{"1":"A","2":"A","3":"B","4":"B"}', '{"1":[{"a":[1,2],"b":[3,4]}]}')
    returning id into v;
  insert into t.ev values ('mine', v);
  perform t.ok('Create: any member can set up an event', v is not null);
  perform t.ok('Create: it''s recorded as theirs', (select created_by from public.events where id = v) = 1);
  e := t.err($q$insert into public.events (name, start_date, style, fmt, club) values ('Sneaky', current_date + 3, 'teams', 'teamstab', true)$q$);
  perform t.ok('Create: only admins can make a club event', e is not null, e);
  e := t.err($q$insert into public.events (name, start_date, style, fmt) values ('Bad', current_date + 3, 'ryder', 'teamstab')$q$);
  perform t.ok('Create: format must suit the style', e is not null, e);
  e := t.err($q$insert into public.events (name, start_date, style, fmt, created_by) values ('As Gary', current_date + 3, 'teams', 'teamstab', 0)$q$);
  perform t.ok('Create: cannot create one as someone else', e is not null, e);
  perform t.ok('Change: can edit my own before it starts', t.val(format($q$with u as (update public.events set name = 'Declan''s Trophy' where id = %s returning 1) select count(*) from u$q$, v)) = 1);
  e := t.err(format($q$update public.events set club = true where id = %s$q$, v));
  perform t.ok('Change: cannot turn it into a club event', e is not null, e);
  e := t.err(format($q$update public.events set everyone = true where id = %s$q$, v));
  perform t.ok('Change: a player cannot show their event to all members', e is not null, e);
  perform t.done();

  perform t.act_as(3); perform t.ok('See: a player in it can', (select count(*) from public.events where id = v) = 1);
  perform t.ok('Change: a player in it cannot edit it', t.val(format($q$with u as (update public.events set name = 'x' where id = %s returning 1) select count(*) from u$q$, v)) = 0); perform t.done();
  perform t.act_as(4); perform t.ok('See: a player in it (second team) can', (select count(*) from public.events where id = v) = 1); perform t.done();
  update public.members set user_id = (select id from auth.users where email = 'ev-test-4@example.invalid') where id = 4;
  perform t.act_as(0); perform t.ok('See: an admin can', (select count(*) from public.events where id = v) = 1); perform t.done();

  -- someone not in it
  insert into auth.users (id, email, aud, role) values (gen_random_uuid(), 'ev-test-9@example.invalid', 'authenticated', 'authenticated');
  update public.members set user_id = (select id from auth.users where email = 'ev-test-9@example.invalid') where id = 9;
  perform t.act_as(9);
  perform t.ok('See: someone not in a private event cannot', (select count(*) from public.events where id = v) = 0);
  perform t.done();
  insert into public.events (name, start_date, style, fmt, club, everyone) values ('Open To All', current_date + 3, 'individual', 'stab', true, true);
  perform t.act_as(9);
  perform t.ok('See: everyone sees all-member events', (select count(*) from public.events where name = 'Open To All') = 1);
  perform t.done();
  -- a club event for entrants only
  perform t.act_as(0);
  insert into public.events (name, start_date, style, fmt, club, everyone, players) values ('Entrants Only Cup', current_date + 3, 'individual', 'stab', true, false, '{2}') returning id into v;
  perform t.done();
  perform t.act_as(9);
  perform t.ok('See: an entrants-only club event is hidden from non-entrants', (select count(*) from public.events where id = v) = 0);
  perform t.done();
  perform t.act_as(2);
  perform t.ok('See: an entrant sees an entrants-only club event', (select count(*) from public.events where id = v) = 1);
  perform t.done();

  -- once it has started, only admins can change it
  update public.events set start_date = current_date where id = v;
  perform t.act_as(1);
  perform t.ok('Change: locked for its creator once the first day arrives', t.val(format($q$with u as (update public.events set name = 'Late' where id = %s returning 1) select count(*) from u$q$, v)) = 0);
  perform t.ok('Delete: locked for its creator once it has started', t.val(format($q$with u as (delete from public.events where id = %s returning 1) select count(*) from u$q$, v)) = 0);
  perform t.done();
  perform t.act_as(0);
  perform t.ok('Change: admins can still fix it on the day', t.val(format($q$with u as (update public.events set name = 'Fixed' where id = %s returning 1) select count(*) from u$q$, v)) = 1);
  perform t.done();
end $$;

select test, ok, detail from t.results order by n;
rollback;
