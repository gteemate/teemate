-- Find a time: the players in a knockout match suggest days (morning, afternoon or evening) up to the round's play-by
-- date, and tick which they can do. When everyone in the match can do one, they're all told. Suggestions go when the
-- match has a result or its players change. Notices go through booking_notices (kinds 'times' and 'agreed').

create table public.match_times (
  id bigserial primary key,
  ko_match_id bigint not null references public.ko_matches on delete cascade,
  day date not null,
  part text not null check (part in ('morning', 'afternoon', 'evening')),
  suggested_by bigint references public.members on delete set null,
  created_at timestamptz not null default now(),
  unique (ko_match_id, day, part)
);
create table public.match_time_answers (
  time_id bigint not null references public.match_times on delete cascade,
  member_id bigint not null references public.members on delete cascade,
  can boolean not null,
  primary key (time_id, member_id)
);

-- The members playing in a knockout match (both sides; two or four).
create function public.ko_match_players(p_match bigint) returns bigint[]
language sql stable security definer set search_path to '' as $$
  select array_remove(array[ea.member_id, ea.partner_id, eb.member_id, eb.partner_id], null)
    from public.ko_matches m left join public.signup_entries ea on ea.id = m.a_entry left join public.signup_entries eb on eb.id = m.b_entry
   where m.id = p_match $$;
revoke execute on function public.ko_match_players(bigint) from public, anon;
grant execute on function public.ko_match_players(bigint) to authenticated; -- the read rules below use it (the draw shows who's in a match anyway)

alter table public.match_times enable row level security;
alter table public.match_time_answers enable row level security;
create policy "players see their match's times" on public.match_times for select to authenticated
  using (public.current_member_id() = any(public.ko_match_players(ko_match_id)) or public.is_admin());
create policy "players see their match's answers" on public.match_time_answers for select to authenticated
  using (exists (select 1 from public.match_times t where t.id = time_id and (public.current_member_id() = any(public.ko_match_players(t.ko_match_id)) or public.is_admin())));
grant select on public.match_times, public.match_time_answers to authenticated;

alter table public.booking_notices drop constraint booking_notices_kind_check;
alter table public.booking_notices add constraint booking_notices_kind_check check (kind in ('cancelled', 'moved', 'added', 'guests', 'times', 'agreed'));
alter table public.booking_notices add column ko_match_id bigint references public.ko_matches on delete cascade, add column part text;

-- The match, checked: it exists, I'm in it, and it's still to be played. → the match
create function public.ko_match_to_arrange(p_match bigint) returns public.ko_matches
language plpgsql security definer set search_path to '' as $$
declare m public.ko_matches;
begin
  select * into m from public.ko_matches where id = p_match for update;
  if not found then raise exception 'That match no longer exists.' using errcode = 'P0001'; end if;
  if public.current_member_id() is null or not (public.current_member_id() = any(public.ko_match_players(p_match))) then
    raise exception 'Only the players in this match can arrange it.' using errcode = '42501';
  end if;
  if m.status not in ('open', 'disputed') or m.a_entry is null or m.b_entry is null then
    raise exception 'That match has been played.' using errcode = 'P0001';
  end if;
  return m;
end $$;
revoke execute on function public.ko_match_to_arrange(bigint) from public, anon, authenticated;

create function public.suggest_match_times(p_match bigint, p_times jsonb) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_me bigint := public.current_member_id(); m public.ko_matches; c public.signup_comps; v_last date; g jsonb; v_day date; v_part text; v_id bigint; v_n int := 0; v_first date;
begin
  m := public.ko_match_to_arrange(p_match);
  select * into c from public.signup_comps where id = m.comp_id;
  v_last := coalesce(c.round_deadlines[m.round], public.club_today() + 21);
  if jsonb_typeof(p_times) <> 'array' or jsonb_array_length(p_times) not between 1 and 6 then
    raise exception 'Pick 1 to 6 days.' using errcode = 'P0001';
  end if;
  for g in select * from jsonb_array_elements(p_times) loop
    v_day := (g->>'day')::date; v_part := g->>'part';
    if v_part is null or v_part not in ('morning', 'afternoon', 'evening') then raise exception 'Pick morning, afternoon or evening.' using errcode = 'P0001'; end if;
    if v_day is null or v_day < public.club_today() or v_day > v_last then raise exception 'Pick days up to the play-by date.' using errcode = 'P0001'; end if;
    if exists (select 1 from public.match_times where ko_match_id = p_match and day = v_day and part = v_part) then
      raise exception 'That day is already suggested.' using errcode = 'P0001';
    end if;
    insert into public.match_times (ko_match_id, day, part, suggested_by) values (p_match, v_day, v_part, v_me) returning id into v_id;
    insert into public.match_time_answers (time_id, member_id, can) values (v_id, v_me, true); -- I can do the ones I suggest
    v_n := v_n + 1;
    v_first := least(coalesce(v_first, v_day), v_day);
  end loop;
  if (select count(*) from public.match_times where ko_match_id = p_match and day >= public.club_today()) > 12 then
    raise exception 'A match can have at most 12 suggestions on the go.' using errcode = 'P0001';
  end if;
  -- The others are told (one notice each per match: a newer one replaces one they haven't seen).
  delete from public.booking_notices where ko_match_id = p_match and kind = 'times' and not seen and member_id <> v_me;
  insert into public.booking_notices (member_id, kind, date, old_time, by_name, note, ko_match_id)
    select x, 'times', v_first, 0, (select name from public.members where id = v_me), c.name, p_match
      from unnest(public.ko_match_players(p_match)) x where x <> v_me;
  return jsonb_build_object('added', v_n);
end $$;

create function public.answer_match_time(p_time bigint, p_can boolean) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_me bigint := public.current_member_id(); t public.match_times; m public.ko_matches; v_players bigint[]; v_agreed boolean := false;
begin
  select * into t from public.match_times where id = p_time;
  if not found then raise exception 'That day is no longer suggested.' using errcode = 'P0001'; end if;
  m := public.ko_match_to_arrange(t.ko_match_id);
  v_players := public.ko_match_players(m.id);
  if p_can is null then delete from public.match_time_answers where time_id = t.id and member_id = v_me;
  else insert into public.match_time_answers (time_id, member_id, can) values (t.id, v_me, p_can)
         on conflict (time_id, member_id) do update set can = excluded.can;
  end if;
  -- Everyone in the match can do it: tell them all (once per suggestion).
  if p_can and t.day >= public.club_today()
     and (select count(*) from public.match_time_answers a where a.time_id = t.id and a.can and a.member_id = any(v_players)) = cardinality(v_players) then
    v_agreed := true;
    if not exists (select 1 from public.booking_notices where kind = 'agreed' and ko_match_id = m.id and date = t.day and part = t.part) then
      insert into public.booking_notices (member_id, kind, date, old_time, note, part, ko_match_id)
        select x, 'agreed', t.day, 0, (select name from public.signup_comps where id = m.comp_id), t.part, m.id from unnest(v_players) x;
    end if;
  end if;
  return jsonb_build_object('agreed', v_agreed);
end $$;

-- The grid: the players, the suggestions still to come (with each player's answer) and the first one everyone can do.
create function public.get_match_times(p_match bigint) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare v_players bigint[] := public.ko_match_players(p_match);
begin
  if v_players is null or not (public.current_member_id() = any(v_players) or public.is_admin()) then
    raise exception 'Only the players in this match can arrange it.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'players', coalesce((select jsonb_agg(jsonb_build_object('id', x, 'name', mb.name) order by o) from unnest(v_players) with ordinality u(x, o) join public.members mb on mb.id = x), '[]'),
    'times', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'day', t.day, 'part', t.part, 'by', t.suggested_by,
               'answers', coalesce((select jsonb_object_agg(a.member_id::text, a.can) from public.match_time_answers a where a.time_id = t.id and a.member_id = any(v_players)), '{}'))
             order by t.day, array_position(array['morning', 'afternoon', 'evening'], t.part))
             from public.match_times t where t.ko_match_id = p_match and t.day >= public.club_today()), '[]'),
    'agreed', (select t.id from public.match_times t where t.ko_match_id = p_match and t.day >= public.club_today()
                 and (select count(*) from public.match_time_answers a where a.time_id = t.id and a.can and a.member_id = any(v_players)) = cardinality(v_players)
               order by t.day, array_position(array['morning', 'afternoon', 'evening'], t.part) limit 1));
end $$;

do $$ declare f text; begin
  foreach f in array array['suggest_match_times(bigint, jsonb)', 'answer_match_time(bigint, boolean)', 'get_match_times(bigint)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- A result, or new players (a redraw or a swap): the suggestions and their unseen notices go.
create function public.clear_match_times() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.status in ('confirmed', 'bye') and old.status is distinct from new.status
     or new.a_entry is distinct from old.a_entry or new.b_entry is distinct from old.b_entry then
    delete from public.match_times where ko_match_id = new.id;
    delete from public.booking_notices where ko_match_id = new.id and kind in ('times', 'agreed') and not seen;
  end if;
  return null;
end $$;
create trigger clear_match_times after update on public.ko_matches for each row execute function public.clear_match_times();
