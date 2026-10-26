-- Entering a competition: when you or your partner are already in it, say which (by name), so a member can pick another
-- partner (members can't see other people's entries).

create or replace function public.enter_signup(p_comp bigint, p_partner bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_me bigint := public.current_member_id(); c public.signup_comps; v_mine text; v_theirs text;
begin
  if v_me is null then raise exception 'Only members can enter.' using errcode = '42501'; end if;
  select * into c from public.signup_comps where id = p_comp and open for update;
  if not found then raise exception 'That competition isn''t open for entries.' using errcode = 'P0001'; end if;
  if c.closes_on is null or current_date > c.closes_on then raise exception 'Entries have closed for %.', c.name using errcode = 'P0001'; end if;
  if c.kind = 'singles' and p_partner is not null then raise exception '% is a singles competition.', c.name using errcode = 'P0001'; end if;
  if c.kind = 'pairs' and (p_partner is null or p_partner = v_me) then raise exception 'Pick your partner for %.', c.name using errcode = 'P0001'; end if;
  select plays_in into v_mine from public.members where id = v_me;
  if p_partner is not null then
    select plays_in into v_theirs from public.members where id = p_partner;
    if not found then raise exception 'That partner isn''t a member.' using errcode = 'P0001'; end if;
  end if;
  if c.category in ('men', 'ladies') then
    if v_mine is null then raise exception 'Set Men''s or Ladies'' in your Account first.' using errcode = 'P0001'; end if;
    if v_mine <> c.category or (p_partner is not null and coalesce(v_theirs, '') <> c.category) then
      raise exception 'That entry isn''t eligible for %.', c.name using errcode = 'P0001';
    end if;
  elsif c.category = 'mixed' then
    if v_mine is null then raise exception 'Set Men''s or Ladies'' in your Account first.' using errcode = 'P0001'; end if;
    if p_partner is not null and (v_theirs is null or v_theirs = v_mine) then raise exception 'A mixed pair is one man and one lady.' using errcode = 'P0001'; end if;
  end if;
  -- Already in it: say who, so the member can pick another partner (they can't see other people's entries).
  if exists (select 1 from public.signup_entries e where e.comp_id = c.id and v_me in (e.member_id, e.partner_id)) then
    raise exception 'You''re already entered in %.', c.name using errcode = 'P0001';
  end if;
  if p_partner is not null and exists (select 1 from public.signup_entries e where e.comp_id = c.id and p_partner in (e.member_id, e.partner_id)) then
    raise exception '% is already entered in %. Pick another partner.', (select name from public.members where id = p_partner), c.name using errcode = 'P0001';
  end if;
  if c.max_entries is not null and (select count(*) from public.signup_entries where comp_id = c.id) >= c.max_entries then
    raise exception 'Sorry, % is full (% places).', c.name, c.max_entries using errcode = 'P0001';
  end if;
  insert into public.signup_entries (comp_id, member_id, partner_id) values (c.id, v_me, p_partner);
end $function$;
