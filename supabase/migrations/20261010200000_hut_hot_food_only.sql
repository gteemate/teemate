-- Only hot food is ordered ahead (it is what takes the time); drinks and snacks are listed, and bought at the hut.

create or replace function public.place_hut_order(p_items jsonb, p_note text, p_round bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_me bigint := public.current_member_id(); v_items jsonb; v_total int; v_slot bigint; v_id bigint;
begin
  if v_me is null then raise exception 'Sign in to order.' using errcode = '42501'; end if;
  if not (select hut_on from public.club_settings where id = 1) then raise exception 'The halfway hut isn''t taking orders just now.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Pick something from the menu first.'; end if;
  if exists (select 1 from jsonb_array_elements(p_items) x where coalesce((x->>'qty')::int, 0) not between 1 and 20) then
    raise exception 'Order between 1 and 20 of each item.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) x join public.hut_menu m on m.id = (x->>'id')::bigint where m.section <> 'Food') then
    raise exception 'Only hot food can be ordered ahead. Drinks and snacks are at the hut.';
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
end $function$;
