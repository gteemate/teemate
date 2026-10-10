-- Entry limits for sign-up competitions: first come, first served (the row lock in enter_signup makes the count
-- safe when two enter at once). Members can see how many have entered (not who), for "places left".

alter table public.signup_comps add column max_entries int check (max_entries >= 2);

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
  if exists (select 1 from public.signup_entries e where e.comp_id = c.id and (e.member_id in (v_me, p_partner) or e.partner_id in (v_me, p_partner))) then
    raise exception 'You or your partner are already entered in %.', c.name using errcode = 'P0001';
  end if;
  if c.max_entries is not null and (select count(*) from public.signup_entries where comp_id = c.id) >= c.max_entries then
    raise exception 'Sorry, % is full (% places).', c.name, c.max_entries using errcode = 'P0001';
  end if;
  insert into public.signup_entries (comp_id, member_id, partner_id) values (c.id, v_me, p_partner);
end $function$;

create function public.signup_counts() returns jsonb
language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_object_agg(c.id::text, (select count(*) from public.signup_entries e where e.comp_id = c.id)), '{}')
    from public.signup_comps c where c.open or public.is_admin()
$$;
revoke execute on function public.signup_counts() from public, anon;
grant execute on function public.signup_counts() to authenticated;
