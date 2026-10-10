-- Leagues with a knockout finish, and pairs leagues. Members can create leagues for their own group (club leagues
-- stay admin-only through the club flag). A league can finish with a knockout of its top 4/8/16 (players, or pairs
-- in a pairs league): the organiser starts it from the table, seeded (1st v last qualifier), byes to the top seeds.

alter table public.events add column league_pairs jsonb,               -- pairs league: [[a, b], …]
  add column ko_top int check (ko_top in (4, 8, 16)),                  -- knockout finish: how many qualify
  add column ko_finish date,                                           -- …and when its final is played by
  add column ko_comp bigint references public.signup_comps (id) on delete set null; -- …once started

create or replace function public.event_is_league_ok(p_style text) returns boolean
language sql stable security definer set search_path to '' as $$ select true $$; -- members' own leagues too

-- A league player can follow its knockout even if they didn't qualify.
create function public.ko_league_player(p_comp bigint) returns boolean
language sql stable security definer set search_path to '' as $$
  select exists (select 1 from public.events e where e.ko_comp = p_comp and public.current_member_id() = any (e.players))
$$;

drop policy "open ones, mine, the ones I'm in; admins all" on public.signup_comps;
create policy "open ones, mine, the ones I'm in; admins all" on public.signup_comps for select to authenticated using (
  open or public.is_admin() or created_by = public.current_member_id() or public.ko_league_player(signup_comps.id)
  or exists (select 1 from public.signup_entries e where e.comp_id = signup_comps.id and public.current_member_id() in (e.member_id, e.partner_id)));
drop policy "published draw, for its players and organiser" on public.ko_matches;
create policy "published draw, for its players and organiser" on public.ko_matches for select to authenticated using (
  public.is_admin() or public.ko_organiser(comp_id) or public.ko_league_player(comp_id) or exists (select 1 from public.signup_comps c where c.id = comp_id and c.draw_published
    and exists (select 1 from public.signup_entries e where e.comp_id = c.id and public.current_member_id() in (e.member_id, e.partner_id))));

-- A seeded bracket: entries in seed order (1st first). Positions 1 v N, N/2 v N/2+1 … so seeds meet as late as
-- possible; when the field is short of a full bracket, the missing (lowest) seeds are byes for the top seeds.
create function public.ko_make_seeded_draw(p_comp bigint, p_order bigint[]) returns void
language plpgsql security definer set search_path to '' as $$
declare n int := array_length(p_order, 1); v_size int := 2; v_pos int[] := array[1, 2]; v_next int[]; s int; k int; r int; v_rounds int; a bigint; b bigint;
begin
  while v_size < n loop v_size := v_size * 2; end loop;
  while array_length(v_pos, 1) < v_size loop
    v_next := '{}';
    foreach s in array v_pos loop v_next := v_next || s || (array_length(v_pos, 1) * 2 + 1 - s); end loop;
    v_pos := v_next;
  end loop;
  v_rounds := round(ln(v_size) / ln(2))::int;
  delete from public.ko_matches where comp_id = p_comp;
  for k in 0 .. v_size / 2 - 1 loop
    a := case when v_pos[2 * k + 1] <= n then p_order[v_pos[2 * k + 1]] end;
    b := case when v_pos[2 * k + 2] <= n then p_order[v_pos[2 * k + 2]] end;
    insert into public.ko_matches (comp_id, round, slot, a_entry, b_entry, status, winner_entry)
    values (p_comp, 1, k, a, b, case when b is null then 'bye' else 'open' end, case when b is null then a end);
  end loop;
  for r in 2 .. v_rounds loop
    insert into public.ko_matches (comp_id, round, slot) select p_comp, r, x from generate_series(0, v_size / (2 ^ r)::int - 1) x;
  end loop;
  perform public.ko_advance(m) from public.ko_matches m where m.comp_id = p_comp and m.round = 1 and m.status = 'bye';
end $$;

-- Start a league's knockout: p_seeds in table order ([[member]] or [[a, b]] for pairs), play-by dates per round.
create function public.start_league_knockout(p_event bigint, p_seeds jsonb, p_deadlines date[]) returns bigint
language plpgsql security definer set search_path to '' as $$
declare v_me bigint := public.current_member_id(); e public.events; v_comp bigint; v_kind text; v_ids bigint[] := '{}'; v_id bigint; x jsonb;
begin
  select * into e from public.events where id = p_event for update;
  if not found or e.style <> 'league' then raise exception 'That league no longer exists.' using errcode = 'P0001'; end if;
  if not (public.is_admin() or e.created_by = v_me) then raise exception 'Only the league''s organiser (or an admin) starts its knockout.' using errcode = '42501'; end if;
  if e.ko_comp is not null then raise exception 'The knockout has already started.' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_seeds) <> 'array' or jsonb_array_length(p_seeds) < 2 then raise exception 'A knockout needs at least two qualifiers.' using errcode = 'P0001'; end if;
  v_kind := case when jsonb_array_length(p_seeds -> 0) = 2 then 'pairs' else 'singles' end;
  insert into public.signup_comps (name, category, kind, closes_on, open, created_by, round_deadlines, draw_published)
  values (left(e.name || ' knockout', 60), 'open', v_kind, current_date, false, coalesce(e.created_by, v_me), coalesce(p_deadlines, '{}'), false) returning id into v_comp;
  for x in select * from jsonb_array_elements(p_seeds) loop
    insert into public.signup_entries (comp_id, member_id, partner_id) values (v_comp, (x ->> 0)::bigint, (x ->> 1)::bigint) returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;
  perform public.ko_make_seeded_draw(v_comp, v_ids);
  update public.signup_comps set draw_published = true where id = v_comp;
  update public.events set ko_comp = v_comp where id = p_event;
  return v_comp;
end $$;

do $$ declare f text; begin
  foreach f in array array['ko_league_player(bigint)', 'start_league_knockout(bigint, jsonb, date[])'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke execute on function public.ko_make_seeded_draw(bigint, bigint[]) from public, anon, authenticated;
end $$;
