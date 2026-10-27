-- Knockout round holes (found in review): a knockout that no longer exists is refused rather than silently ignored,
-- and the round has to be one of the draw's (up to 10 rounds before a draw is made).
create or replace function public.set_ko_round_holes(p_comp bigint, p_round int, p_holes jsonb) returns void
language plpgsql security definer set search_path to '' as $$
declare v_rounds int;
begin
  if not exists (select 1 from public.signup_comps where id = p_comp) then
    raise exception 'That knockout no longer exists.' using errcode = 'P0001';
  end if;
  if not (public.is_admin() or public.ko_organiser(p_comp)) then
    raise exception 'Only the knockout''s organiser (or an admin) sets its holes.' using errcode = '42501';
  end if;
  select max(round) into v_rounds from public.ko_matches where comp_id = p_comp;
  if p_round is null or p_round < 1 or p_round > coalesce(v_rounds, 10) then
    raise exception 'That isn''t a round of this knockout.' using errcode = 'P0001';
  end if;
  if public.holes_problem(p_holes) is not null then raise exception '%', public.holes_problem(p_holes) using errcode = 'P0001'; end if;
  update public.signup_comps set round_holes = case
      when p_holes is null or jsonb_typeof(p_holes) = 'null' then nullif(coalesce(round_holes, '{}') - p_round::text, '{}'::jsonb)
      else coalesce(round_holes, '{}') || jsonb_build_object(p_round::text, p_holes) end
    where id = p_comp;
end $$;
