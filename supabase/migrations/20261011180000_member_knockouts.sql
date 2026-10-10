-- Knockouts members set up themselves: the organiser names it, picks the players (or pairs) and the play-by dates;
-- it's drawn and published in one step. Only the players in it (and the organiser) see it; the organiser can set
-- results and walkovers, and delete it. The draw itself is shared with admins' club knockouts (ko_make_draw).

alter table public.signup_comps add column created_by bigint references public.members (id) on delete cascade;

create function public.ko_organiser(p_comp bigint) returns boolean
language sql stable security definer set search_path to '' as $$
  select coalesce((select created_by = public.current_member_id() from public.signup_comps where id = p_comp), false)
$$;

create function public.ko_make_draw(p_comp bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.signup_comps; v_ids bigint[]; n int; v_size int := 2; v_m int; v_rounds int; r int; k int; v_order int[]; s int;
begin
  select * into c from public.signup_comps where id = p_comp for update;
  if not found then raise exception 'That competition no longer exists.' using errcode = 'P0001'; end if;
  if c.draw_published then raise exception 'The draw is already published.' using errcode = 'P0001'; end if;
  select array_agg(id order by random()) into v_ids from public.signup_entries where comp_id = p_comp;
  n := coalesce(array_length(v_ids, 1), 0);
  if n < 2 then raise exception 'A draw needs at least two entries.' using errcode = 'P0001'; end if;
  while v_size < n loop v_size := v_size * 2; end loop;
  v_m := v_size / 2; v_rounds := round(ln(v_size) / ln(2))::int;
  delete from public.ko_matches where comp_id = p_comp;
  -- Round 1: everyone has a first-match place; the rest play someone (no match is two byes). Match order random.
  select array_agg(x order by random()) into v_order from generate_series(0, v_m - 1) x;
  for k in 1 .. v_m loop
    s := v_order[k];
    insert into public.ko_matches (comp_id, round, slot, a_entry, b_entry, status, winner_entry)
    values (p_comp, 1, s, v_ids[k], case when v_m + k <= n then v_ids[v_m + k] end,
            case when v_m + k <= n then 'open' else 'bye' end, case when v_m + k <= n then null else v_ids[k] end);
  end loop;
  for r in 2 .. v_rounds loop
    insert into public.ko_matches (comp_id, round, slot) select p_comp, r, x from generate_series(0, v_size / (2 ^ r)::int - 1) x;
  end loop;
  perform public.ko_advance(m) from public.ko_matches m where m.comp_id = p_comp and m.round = 1 and m.status = 'bye';
end $function$;

create or replace function public.admin_make_draw(p_comp bigint) returns void
language plpgsql security definer set search_path to '' as $$
begin
  if not public.is_admin() then raise exception 'Only admins can make the draw.' using errcode = '42501'; end if;
  perform public.ko_make_draw(p_comp);
end $$;

create or replace function public.admin_set_ko_result(p_match bigint, p_winner bigint, p_result text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m public.ko_matches; nxt public.ko_matches;
begin
  select * into m from public.ko_matches where id = p_match for update;
  if not (public.is_admin() or public.ko_organiser(m.comp_id)) then raise exception 'Only the organiser (or an admin) can set results.' using errcode = '42501'; end if;
  if p_winner is null or p_winner not in (coalesce(m.a_entry, -1), coalesce(m.b_entry, -1)) then raise exception 'Pick who won.' using errcode = 'P0001'; end if;
  select * into nxt from public.ko_matches where comp_id = m.comp_id and round = m.round + 1 and slot = m.slot / 2;
  if found and nxt.status not in ('open') then raise exception 'The next round''s match has been played: correct that one first.' using errcode = 'P0001'; end if;
  update public.ko_matches set status = 'confirmed', winner_entry = p_winner, result = left(trim(coalesce(p_result, '')), 40), updated_at = now() where id = m.id returning * into m;
  perform public.ko_advance(m);
end $function$;

create or replace function public.ko_entries(p_comp bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'memberId', e.member_id, 'partnerId', e.partner_id)), '[]')
    from public.signup_entries e
   where e.comp_id = p_comp
     and (public.is_admin() or public.ko_organiser(p_comp) or ((select draw_published from public.signup_comps where id = p_comp) and public.my_ko_entry(p_comp) is not null))
$function$;

drop policy "members see open ones, admins all" on public.signup_comps;
create policy "open ones, mine, the ones I'm in; admins all" on public.signup_comps for select to authenticated using (
  open or public.is_admin() or created_by = public.current_member_id()
  or exists (select 1 from public.signup_entries e where e.comp_id = id and public.current_member_id() in (e.member_id, e.partner_id)));
drop policy "published draw, for its players" on public.ko_matches;
create policy "published draw, for its players and organiser" on public.ko_matches for select to authenticated using (
  public.is_admin() or public.ko_organiser(comp_id) or exists (select 1 from public.signup_comps c where c.id = comp_id and c.draw_published
    and exists (select 1 from public.signup_entries e where e.comp_id = c.id and public.current_member_id() in (e.member_id, e.partner_id))));

create function public.create_member_knockout(p_name text, p_kind text, p_entries jsonb, p_deadlines date[]) returns bigint
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
  values (trim(p_name), 'open', p_kind, current_date, false, v_me, coalesce(p_deadlines, '{}'), true) returning id into v_id;
  insert into public.signup_entries (comp_id, member_id, partner_id)
  select v_id, (x ->> 0)::bigint, (x ->> 1)::bigint from jsonb_array_elements(p_entries) x;
  perform public.ko_make_draw(v_id);
  return v_id;
end $$;

create function public.delete_member_knockout(p_comp bigint) returns void
language plpgsql security definer set search_path to '' as $$
begin
  if not public.ko_organiser(p_comp) then raise exception 'Only the organiser can delete it.' using errcode = '42501'; end if;
  delete from public.signup_comps where id = p_comp;
end $$;

do $$ declare f text; begin
  foreach f in array array['ko_organiser(bigint)', 'create_member_knockout(text, text, jsonb, date[])', 'delete_member_knockout(bigint)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke execute on function public.ko_make_draw(bigint) from public, anon, authenticated;
end $$;
