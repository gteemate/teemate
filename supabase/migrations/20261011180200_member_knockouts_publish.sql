-- Member knockouts: draw first, then publish (the draw refuses a published competition).

create or replace function public.create_member_knockout(p_name text, p_kind text, p_entries jsonb, p_deadlines date[]) returns bigint
language plpgsql security definer set search_path to '' as $$
declare v_me bigint := public.current_member_id(); v_id bigint; x jsonb; v_all bigint[] := '{}'; v_ids bigint[];
begin
  if v_me is null then raise exception 'Only members can set up a knockout.' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 60 then raise exception 'Give the knockout a name.' using errcode = 'P0001'; end if;
  if p_kind not in ('singles', 'pairs') then raise exception 'Singles or pairs?' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) < 2 then raise exception 'A knockout needs at least two entries.' using errcode = 'P0001'; end if;
  if jsonb_array_length(p_entries) > 64 then raise exception 'At most 64 entries.' using errcode = 'P0001'; end if;
  for x in select * from jsonb_array_elements(p_entries) loop
    v_ids := array(select (y #>> '{}')::bigint from jsonb_array_elements(x) y);
    if coalesce(array_length(v_ids, 1), 0) <> (case p_kind when 'pairs' then 2 else 1 end) then
      raise exception 'Each entry in a % knockout is %.', p_kind, case p_kind when 'pairs' then 'a pair of two players' else 'one player' end using errcode = 'P0001';
    end if;
    if v_ids && v_all then raise exception 'Someone is in it twice.' using errcode = 'P0001'; end if;
    if (select count(*) from public.members where id = any (v_ids)) <> array_length(v_ids, 1) then raise exception 'One of those players isn''t a member.' using errcode = 'P0001'; end if;
    v_all := v_all || v_ids;
  end loop;
  insert into public.signup_comps (name, category, kind, closes_on, open, created_by, round_deadlines, draw_published)
  values (trim(p_name), 'open', p_kind, current_date, false, v_me, coalesce(p_deadlines, '{}'), false) returning id into v_id;
  insert into public.signup_entries (comp_id, member_id, partner_id)
  select v_id, (pe ->> 0)::bigint, (pe ->> 1)::bigint from jsonb_array_elements(p_entries) pe;
  perform public.ko_make_draw(v_id);
  update public.signup_comps set draw_published = true where id = v_id; -- drawn, then shown to the players
  return v_id;
end $$;


