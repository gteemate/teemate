-- Knockout draw for sign-up competitions: a random bracket (byes through to round 2), play-by dates per round,
-- results reported by one side and confirmed by the other (or set by an admin), winners moving on. Players see
-- it once an admin publishes the draw.

alter table public.signup_comps add column draw_published boolean not null default false,
  add column round_deadlines date[] not null default '{}';

create table public.ko_matches (
  id bigserial primary key,
  comp_id bigint not null references public.signup_comps (id) on delete cascade,
  round int not null check (round >= 1),
  slot int not null check (slot >= 0),
  a_entry bigint references public.signup_entries (id) on delete set null,
  b_entry bigint references public.signup_entries (id) on delete set null,
  winner_entry bigint references public.signup_entries (id) on delete set null,
  result text check (char_length(result) <= 40),
  status text not null default 'open' check (status in ('open', 'reported', 'confirmed', 'disputed', 'bye')),
  reported_entry bigint references public.signup_entries (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (comp_id, round, slot)
);
alter table public.ko_matches enable row level security;
-- Players in the competition see a published draw; admins always.
create policy "published draw, for its players" on public.ko_matches for select to authenticated using (
  public.is_admin() or exists (select 1 from public.signup_comps c where c.id = comp_id and c.draw_published
    and exists (select 1 from public.signup_entries e where e.comp_id = c.id and public.current_member_id() in (e.member_id, e.partner_id))));
revoke all on public.ko_matches from public, anon;
grant select on public.ko_matches to authenticated;

-- My entry in a competition (as the player or the partner), or null.
create function public.my_ko_entry(p_comp bigint) returns bigint
language sql stable security definer set search_path to '' as $$
  select id from public.signup_entries where comp_id = p_comp and public.current_member_id() in (member_id, partner_id) limit 1
$$;

-- Put a winner into the next round (none after the final). Clears the next match's result if it changes there.
create function public.ko_advance(m public.ko_matches) returns void
language plpgsql security definer set search_path to '' as $$
declare v_last int;
begin
  select max(round) into v_last from public.ko_matches where comp_id = m.comp_id;
  if m.round >= v_last then return; end if;
  if m.slot % 2 = 0 then
    update public.ko_matches set a_entry = m.winner_entry, updated_at = now() where comp_id = m.comp_id and round = m.round + 1 and slot = m.slot / 2;
  else
    update public.ko_matches set b_entry = m.winner_entry, updated_at = now() where comp_id = m.comp_id and round = m.round + 1 and slot = m.slot / 2;
  end if;
end $$;

create function public.admin_make_draw(p_comp bigint) returns void
language plpgsql security definer set search_path to '' as $$
declare c public.signup_comps; v_ids bigint[]; n int; v_size int := 2; v_m int; v_rounds int; r int; k int; v_order int[]; s int;
begin
  if not public.is_admin() then raise exception 'Only admins can make the draw.' using errcode = '42501'; end if;
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
end $$;

create function public.admin_swap_draw(p_comp bigint, p_x bigint, p_y bigint) returns void
language plpgsql security definer set search_path to '' as $$
begin
  if not public.is_admin() then raise exception 'Only admins can change the draw.' using errcode = '42501'; end if;
  if (select draw_published from public.signup_comps where id = p_comp) then raise exception 'The draw is published.' using errcode = 'P0001'; end if;
  update public.ko_matches set
    a_entry = case a_entry when p_x then p_y when p_y then p_x else a_entry end,
    b_entry = case b_entry when p_x then p_y when p_y then p_x else b_entry end,
    winner_entry = case winner_entry when p_x then p_y when p_y then p_x else winner_entry end
  where comp_id = p_comp;
end $$;

create function public.admin_set_round_deadlines(p_comp bigint, p_dates date[]) returns void
language plpgsql security definer set search_path to '' as $$
begin
  if not public.is_admin() then raise exception 'Only admins can set the dates.' using errcode = '42501'; end if;
  update public.signup_comps set round_deadlines = coalesce(p_dates, '{}') where id = p_comp;
end $$;

create function public.admin_publish_draw(p_comp bigint) returns void
language plpgsql security definer set search_path to '' as $$
begin
  if not public.is_admin() then raise exception 'Only admins can publish the draw.' using errcode = '42501'; end if;
  if not exists (select 1 from public.ko_matches where comp_id = p_comp) then raise exception 'Make the draw first.' using errcode = 'P0001'; end if;
  update public.signup_comps set draw_published = true where id = p_comp;
end $$;

create function public.report_ko_result(p_match bigint, p_winner bigint, p_result text) returns void
language plpgsql security definer set search_path to '' as $$
declare m public.ko_matches; v_mine bigint;
begin
  select * into m from public.ko_matches where id = p_match for update;
  if not found then raise exception 'That match no longer exists.' using errcode = 'P0001'; end if;
  v_mine := public.my_ko_entry(m.comp_id);
  if v_mine is null or v_mine not in (m.a_entry, m.b_entry) then raise exception 'You can only report your match.' using errcode = '42501'; end if;
  if m.status <> 'open' then raise exception 'That match already has a result.' using errcode = 'P0001'; end if;
  if m.a_entry is null or m.b_entry is null then raise exception 'Both sides aren''t known yet.' using errcode = 'P0001'; end if;
  if p_winner not in (m.a_entry, m.b_entry) then raise exception 'Pick who won.' using errcode = 'P0001'; end if;
  update public.ko_matches set status = 'reported', winner_entry = p_winner, result = left(trim(coalesce(p_result, '')), 40), reported_entry = v_mine, updated_at = now() where id = m.id;
end $$;

create function public.confirm_ko_result(p_match bigint) returns void
language plpgsql security definer set search_path to '' as $$
declare m public.ko_matches; v_mine bigint;
begin
  select * into m from public.ko_matches where id = p_match for update;
  v_mine := public.my_ko_entry(m.comp_id);
  if m.status <> 'reported' then raise exception 'There''s no result waiting to confirm.' using errcode = 'P0001'; end if;
  if v_mine is null or v_mine not in (m.a_entry, m.b_entry) or v_mine = m.reported_entry then raise exception 'The other side confirms the result.' using errcode = '42501'; end if;
  update public.ko_matches set status = 'confirmed', updated_at = now() where id = m.id returning * into m;
  perform public.ko_advance(m);
end $$;

create function public.dispute_ko_result(p_match bigint) returns void
language plpgsql security definer set search_path to '' as $$
declare m public.ko_matches; v_mine bigint;
begin
  select * into m from public.ko_matches where id = p_match for update;
  v_mine := public.my_ko_entry(m.comp_id);
  if m.status <> 'reported' or v_mine is null or v_mine not in (m.a_entry, m.b_entry) or v_mine = m.reported_entry then
    raise exception 'Only the other side can question a reported result.' using errcode = '42501';
  end if;
  update public.ko_matches set status = 'disputed', updated_at = now() where id = m.id;
end $$;

-- Admins: set or correct a result (a walkover too). A correction only while the next match hasn't been played.
create function public.admin_set_ko_result(p_match bigint, p_winner bigint, p_result text) returns void
language plpgsql security definer set search_path to '' as $$
declare m public.ko_matches; nxt public.ko_matches;
begin
  if not public.is_admin() then raise exception 'Only admins can set results.' using errcode = '42501'; end if;
  select * into m from public.ko_matches where id = p_match for update;
  if p_winner is null or p_winner not in (coalesce(m.a_entry, -1), coalesce(m.b_entry, -1)) then raise exception 'Pick who won.' using errcode = 'P0001'; end if;
  select * into nxt from public.ko_matches where comp_id = m.comp_id and round = m.round + 1 and slot = m.slot / 2;
  if found and nxt.status not in ('open') then raise exception 'The next round''s match has been played: correct that one first.' using errcode = 'P0001'; end if;
  update public.ko_matches set status = 'confirmed', winner_entry = p_winner, result = left(trim(coalesce(p_result, '')), 40), updated_at = now() where id = m.id returning * into m;
  perform public.ko_advance(m);
end $$;

do $$ declare f text; begin
  foreach f in array array['my_ko_entry(bigint)', 'ko_advance(public.ko_matches)', 'admin_make_draw(bigint)', 'admin_swap_draw(bigint, bigint, bigint)',
    'admin_set_round_deadlines(bigint, date[])', 'admin_publish_draw(bigint)', 'report_ko_result(bigint, bigint, text)', 'confirm_ko_result(bigint)',
    'dispute_ko_result(bigint)', 'admin_set_ko_result(bigint, bigint, text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    if f <> 'ko_advance(public.ko_matches)' then execute format('grant execute on function public.%s to authenticated', f); end if;
  end loop;
end $$;
