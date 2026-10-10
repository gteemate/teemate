-- Halfway hut: players order from the menu after hole 8 and pay at the hut; hut staff mark orders ready.
-- Admins switch it on, keep the menu and choose the hut staff. Orders change only through the functions below,
-- which take names and prices from the menu (kept on the order as they were).

alter table public.club_settings add column hut_on boolean not null default false;
alter table public.members add column hut_staff boolean not null default false;

create function public.is_hut_staff() returns boolean
language sql stable security definer set search_path to '' as $$
  select coalesce((select admin or hut_staff from public.members where user_id = auth.uid()), false)
$$;
revoke execute on function public.is_hut_staff() from public, anon;
grant execute on function public.is_hut_staff() to authenticated;

create table public.hut_menu (
  id bigserial primary key,
  section text not null check (section in ('Food', 'Drinks', 'Snacks')),
  name text not null check (char_length(trim(name)) between 1 and 40),
  price_pence int not null check (price_pence between 0 and 9999),
  sold_out boolean not null default false,
  sort int not null default 0
);
alter table public.hut_menu enable row level security;
create policy "members read the menu" on public.hut_menu for select to authenticated using (true);
create policy "admins keep the menu" on public.hut_menu for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.hut_menu from public, anon;
grant select, insert, update, delete on public.hut_menu to authenticated;
grant usage on sequence public.hut_menu_id_seq to authenticated;

create table public.hut_orders (
  id bigserial primary key,
  member_id bigint not null references public.members (id) on delete cascade,
  round_id bigint references public.rounds (id) on delete set null,
  slot_id bigint references public.tee_slots (id) on delete set null,
  items jsonb not null,          -- [{ id, name, qty, pricePence }] as ordered
  total_pence int not null,
  note text check (char_length(note) <= 200),
  status text not null default 'sent' check (status in ('sent', 'ready', 'collected', 'cancelled')),
  cancel_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.hut_orders (created_at);
create index on public.hut_orders (member_id, created_at);
alter table public.hut_orders enable row level security;
create policy "own orders, or the hut's" on public.hut_orders for select to authenticated
  using (member_id = public.current_member_id() or public.is_hut_staff());
revoke all on public.hut_orders from public, anon;
grant select on public.hut_orders to authenticated;

create function public.get_hut() returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('on', (select hut_on from public.club_settings where id = 1),
    'menu', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'section', section, 'name', name, 'pricePence', price_pence, 'soldOut', sold_out, 'sort', sort) order by section, sort, id)
                        from public.hut_menu), '[]'))
$$;

create function public.admin_set_hut_on(p_on boolean) returns void
language plpgsql security definer set search_path to '' as $$
begin
  if not public.is_admin() then raise exception 'Only admins can switch the halfway hut on or off.' using errcode = '42501'; end if;
  update public.club_settings set hut_on = coalesce(p_on, false) where id = 1;
end $$;

create function public.admin_set_hut_staff(p_member bigint, p_on boolean) returns void
language plpgsql security definer set search_path to '' as $$
begin
  if not public.is_admin() then raise exception 'Only admins can choose the hut staff.' using errcode = '42501'; end if;
  update public.members set hut_staff = coalesce(p_on, false) where id = p_member;
end $$;

create function public.place_hut_order(p_items jsonb, p_note text, p_round bigint) returns bigint
language plpgsql security definer set search_path to '' as $$
declare v_me bigint := public.current_member_id(); v_items jsonb; v_total int; v_slot bigint; v_id bigint;
begin
  if v_me is null then raise exception 'Sign in to order.' using errcode = '42501'; end if;
  if not (select hut_on from public.club_settings where id = 1) then raise exception 'The halfway hut isn''t taking orders just now.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Pick something from the menu first.'; end if;
  if exists (select 1 from jsonb_array_elements(p_items) x where coalesce((x->>'qty')::int, 0) not between 1 and 20) then
    raise exception 'Order between 1 and 20 of each item.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) x left join public.hut_menu m on m.id = (x->>'id')::bigint where m.id is null or m.sold_out) then
    raise exception 'Something you picked has sold out or come off the menu. Have another look.';
  end if;
  if (select count(*) from public.hut_orders where member_id = v_me and status = 'sent') >= 3 then
    raise exception 'You already have 3 orders waiting at the hut.';
  end if;
  if p_round is not null then
    select r.slot_id into v_slot from public.rounds r where r.id = p_round and public.on_card(r.lineup);
    if not found then raise exception 'You can only order for a card you''re on.'; end if;
  end if;
  select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'qty', (x->>'qty')::int, 'pricePence', m.price_pence) order by m.section, m.sort, m.id),
         sum(m.price_pence * (x->>'qty')::int)
    into v_items, v_total
    from jsonb_array_elements(p_items) x join public.hut_menu m on m.id = (x->>'id')::bigint;
  insert into public.hut_orders (member_id, round_id, slot_id, items, total_pence, note)
  values (v_me, p_round, v_slot, v_items, v_total, nullif(left(trim(coalesce(p_note, '')), 200), ''))
  returning id into v_id;
  return v_id;
end $$;

create function public.cancel_my_hut_order(p_order bigint) returns void
language plpgsql security definer set search_path to '' as $$
declare v_status text;
begin
  select status into v_status from public.hut_orders where id = p_order and member_id = public.current_member_id() for update;
  if not found then raise exception 'That order isn''t yours.' using errcode = '42501'; end if;
  if v_status <> 'sent' then raise exception 'The hut has already started on that order. Have a word with them.'; end if;
  update public.hut_orders set status = 'cancelled', cancel_note = 'Cancelled by you', updated_at = now() where id = p_order;
end $$;

create function public.hut_set_order_status(p_order bigint, p_status text, p_note text) returns void
language plpgsql security definer set search_path to '' as $$
declare v_status text;
begin
  if not public.is_hut_staff() then raise exception 'Only hut staff can update orders.' using errcode = '42501'; end if;
  select status into v_status from public.hut_orders where id = p_order for update;
  if not found then raise exception 'That order has gone.'; end if;
  if not ((v_status = 'sent' and p_status in ('ready', 'cancelled')) or (v_status = 'ready' and p_status in ('collected', 'cancelled'))) then
    raise exception 'That order is already %.', v_status;
  end if;
  if p_status = 'cancelled' and trim(coalesce(p_note, '')) = '' then raise exception 'Give a reason for cancelling, so the player knows.'; end if;
  update public.hut_orders set status = p_status, updated_at = now(),
         cancel_note = case when p_status = 'cancelled' then left(trim(p_note), 200) else cancel_note end
   where id = p_order;
end $$;

-- Today's orders, oldest first, with who and their tee time.
create function public.hut_orders_today() returns jsonb
language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.is_hut_staff() then raise exception 'Only hut staff can see the orders.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'memberName', m.name, 'time', s.start_time, 'items', o.items, 'totalPence', o.total_pence,
            'note', o.note, 'status', o.status, 'cancelNote', o.cancel_note, 'createdAt', o.created_at, 'roundId', o.round_id) order by o.created_at)
    from public.hut_orders o join public.members m on m.id = o.member_id left join public.tee_slots s on s.id = o.slot_id
   where o.created_at >= current_date), '[]');
end $$;

create function public.my_hut_orders() returns jsonb
language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'items', o.items, 'totalPence', o.total_pence, 'note', o.note, 'status', o.status,
           'cancelNote', o.cancel_note, 'createdAt', o.created_at, 'roundId', o.round_id) order by o.created_at desc), '[]')
    from public.hut_orders o where o.member_id = public.current_member_id() and o.created_at >= current_date
$$;

do $$ declare f text; begin
  foreach f in array array['get_hut()', 'admin_set_hut_on(boolean)', 'admin_set_hut_staff(bigint, boolean)', 'place_hut_order(jsonb, text, bigint)',
                           'cancel_my_hut_order(bigint)', 'hut_set_order_status(bigint, text, text)', 'hut_orders_today()', 'my_hut_orders()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
