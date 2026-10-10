-- Database tests: the halfway hut (menu, orders, hut staff). Rolled back.
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

insert into public.members (id, name) values (990901, 'Hut Admin'), (990902, 'Hut Player'), (990903, 'Hut Other'), (990904, 'Hut Staff');
insert into auth.users (id, email, aud, role) select gen_random_uuid(), 'hut-test-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 4) i;
update public.members m set user_id = (select id from auth.users where email = 'hut-test-' || (m.id - 990900) || '@example.invalid'), admin = (m.id = 990901) where m.id between 990901 and 990904;
create function t.act_as(p_member bigint) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.members where id = p_member), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function t.act_as(bigint) to authenticated;


-- The player's card (with the other member not on it), and an empty menu to start from.
delete from public.hut_orders; delete from public.hut_menu;
with r as (insert into public.rounds (created_by, lineup, scores, done, game) values (990902, '[{"m":990902}]', '[]', (select jsonb_agg(true) from generate_series(1, 8)) || (select jsonb_agg(false) from generate_series(1, 10)), 'stab') returning id)
insert into t.ids select 'card', id from r;

do $$ declare e text; j jsonb; o bigint; begin
  perform t.act_as(990901);
  perform public.admin_set_hut_on(true);
  insert into public.hut_menu (section, name, price_pence, sort) values ('Food', 'Bacon roll', 450, 1), ('Drinks', 'Tea', 250, 1), ('Food', 'Sausage roll', 400, 2);
  update public.hut_menu set sold_out = true where name = 'Sausage roll';
  perform public.admin_set_hut_staff(990904, true);
  perform t.ok('Admin switches the hut on, sets the menu and the staff', (public.get_hut()->>'on')::boolean and jsonb_array_length(public.get_hut()->'menu') = 3
    and (select hut_staff from public.members where id = 990904));
  reset role;
  perform t.set('bacon', (select id from public.hut_menu where name = 'Bacon roll'));
  perform t.set('tea', (select id from public.hut_menu where name = 'Tea'));
  perform t.set('sausage', (select id from public.hut_menu where name = 'Sausage roll'));

  perform t.act_as(990902);
  e := t.err('insert into public.hut_menu (section, name, price_pence) values (''Food'', ''Free lunch'', 0)');
  perform t.ok('Members can''t change the menu', e is not null, e);
  e := t.err('select public.admin_set_hut_on(false)');
  perform t.ok('Members can''t switch the hut', e like '%Only admins%', e);
  o := public.place_hut_order(jsonb_build_array(jsonb_build_object('id', t.id('bacon'), 'qty', 2), jsonb_build_object('id', t.id('tea'), 'qty', 1)), '  no ketchup  ', t.id('card'));
  perform t.set('order', o);
  perform t.ok('Order: total and items from the menu, note trimmed, sent',
    (select total_pence = 1150 and status = 'sent' and note = 'no ketchup' and jsonb_array_length(items) = 2 and round_id = t.id('card') from public.hut_orders where id = o));
  e := t.err(format('select public.place_hut_order(%L, null, null)', jsonb_build_array(jsonb_build_object('id', t.id('sausage'), 'qty', 1))));
  perform t.ok('Order: sold out refused', e like '%sold out%', e);
  e := t.err('select public.place_hut_order(''[]'', null, null)');
  perform t.ok('Order: empty refused', e like '%Pick%', e);
  e := t.err(format('select public.place_hut_order(%L, null, null)', jsonb_build_array(jsonb_build_object('id', t.id('tea'), 'qty', 21))));
  perform t.ok('Order: more than 20 of one thing refused', e is not null, e);
  perform public.place_hut_order(jsonb_build_array(jsonb_build_object('id', t.id('tea'), 'qty', 1)), null, null);
  perform public.place_hut_order(jsonb_build_array(jsonb_build_object('id', t.id('tea'), 'qty', 1)), null, null);
  e := t.err(format('select public.place_hut_order(%L, null, null)', jsonb_build_array(jsonb_build_object('id', t.id('tea'), 'qty', 1))));
  perform t.ok('Order: at most 3 waiting', e like '%3 orders%', e);
  reset role;

  perform t.act_as(990903);
  e := t.err(format('select public.place_hut_order(%L, null, %s)', jsonb_build_array(jsonb_build_object('id', t.id('tea'), 'qty', 1)), t.id('card')));
  perform t.ok('Order: not for a card you''re not on', e like '%card%', e);
  perform t.ok('Members see only their own orders', not exists (select 1 from public.hut_orders where member_id = 990902));
  e := t.err(format('select public.hut_set_order_status(%s, ''ready'', null)', t.id('order')));
  perform t.ok('Members can''t mark orders ready', e like '%hut staff%', e);
  e := t.err(format('select public.cancel_my_hut_order(%s)', t.id('order')));
  perform t.ok('Members can''t cancel someone else''s order', e is not null, e);
  reset role;

  update public.hut_menu set price_pence = 999, name = 'Bacon bap' where id = t.id('bacon');
  perform t.ok('Orders keep the name and price they were placed at', (select x->>'name' = 'Bacon roll' and (x->>'pricePence')::int = 450 from public.hut_orders o, jsonb_array_elements(o.items) x
     where o.id = t.id('order') and (x->>'id')::bigint = t.id('bacon')));

  perform t.act_as(990901); perform public.admin_set_hut_on(false); reset role;
  perform t.act_as(990904);
  perform t.ok('Staff see everyone''s orders today, with names', (select count(*) from jsonb_array_elements(public.hut_orders_today()) x where x->>'memberName' = 'Hut Player') = 3);
  perform public.hut_set_order_status(t.id('order'), 'ready', null);
  perform t.ok('Staff mark it ready (even with the hut switched off since)', (select status from public.hut_orders where id = t.id('order')) = 'ready');
  e := t.err(format('select public.hut_set_order_status(%s, ''sent'', null)', t.id('order')));
  perform t.ok('No going backwards', e is not null, e);
  e := t.err(format('select public.hut_set_order_status(%s, ''cancelled'', ''  '')', t.id('order')));
  perform t.ok('Cancelling needs a reason', e like '%reason%', e);
  perform public.hut_set_order_status(t.id('order'), 'collected', null);
  perform t.ok('Collected', (select status from public.hut_orders where id = t.id('order')) = 'collected');
  reset role;

  perform t.act_as(990902);
  e := t.err(format('select public.cancel_my_hut_order(%s)', t.id('order')));
  perform t.ok('Player can''t cancel once the hut has it', e like '%already%', e);
  perform t.ok('My orders today', jsonb_array_length(public.my_hut_orders()) = 3);
  e := t.err(format('select public.place_hut_order(%L, null, null)', jsonb_build_array(jsonb_build_object('id', t.id('tea'), 'qty', 1))));
  perform t.ok('Order: refused while the hut is off', e like '%isn''t taking orders%', e);
  reset role;

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  e := t.err(format('select public.place_hut_order(%L, null, null)', jsonb_build_array(jsonb_build_object('id', t.id('tea'), 'qty', 1))));
  perform t.ok('Visitors can''t order', e is not null, e);
  reset role;
end $$;

select test, ok, detail from t.results order by n;
rollback;
