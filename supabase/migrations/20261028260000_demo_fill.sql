-- Demo entries: the club office fills a sign-up competition or a sign-up event with made-up players for a demo, and
-- takes them out again. Demo players are members marked demo: the ones already there first, then new ones with
-- made-up names, in the section the competition needs (one man and one lady per mixed pair). Real entries stay.

alter table public.members add column demo boolean not null default false;
grant select (demo) on public.members to authenticated;

-- p_n demo members in a section (null: either), not in p_exclude: existing ones first, then new ones.
create function public.demo_pick(p_section text, p_exclude bigint[], p_n int) returns bigint[]
language plpgsql security definer set search_path to '' as $$
declare v bigint[]; v_id bigint; v_sec text; v_first text[];
  v_men text[] := array['Conor', 'Ciarán', 'Declan', 'Eoin', 'Fergal', 'Niall', 'Ronan', 'Seán', 'Brendan', 'Colm', 'Darragh', 'Cathal', 'Pádraig', 'Kevin', 'Mark', 'David', 'Paul', 'Brian', 'Gerard', 'Liam'];
  v_ladies text[] := array['Aoife', 'Siobhán', 'Niamh', 'Clodagh', 'Gráinne', 'Róisín', 'Deirdre', 'Sinéad', 'Orlaith', 'Úna', 'Maeve', 'Caitríona', 'Fiona', 'Claire', 'Louise', 'Mary', 'Ciara', 'Emer', 'Sorcha', 'Bríd'];
  v_sur text[] := array['Murphy', 'Kelly', 'O''Brien', 'Byrne', 'Ryan', 'Walsh', 'O''Connor', 'McCarthy', 'Doyle', 'Gallagher', 'Kennedy', 'Lynch', 'Quinn', 'Brennan', 'Daly', 'Nolan', 'Burke', 'Farrell', 'Moran', 'Hughes', 'Duffy', 'Fitzgerald', 'Hayes', 'Kavanagh', 'Power', 'Boyle', 'Healy', 'Keane', 'Sheridan', 'Whelan'];
begin
  if p_n <= 0 then return '{}'; end if;
  select coalesce(array_agg(id), '{}') into v from (
    select id from public.members where demo and (p_section is null or plays_in = p_section) and not (id = any (coalesce(p_exclude, '{}')))
     order by random() limit p_n) x;
  while cardinality(v) < p_n loop
    v_sec := coalesce(p_section, case when random() < 0.5 then 'men' else 'ladies' end);
    v_first := case v_sec when 'men' then v_men else v_ladies end;
    insert into public.members (name, hcp_index, plays_in, demo)
      values (v_first[1 + floor(random() * cardinality(v_first))::int] || ' ' || v_sur[1 + floor(random() * cardinality(v_sur))::int],
              round((2 + random() * 26)::numeric, 1), v_sec, true)
      returning id into v_id;
    v := v || v_id;
  end loop;
  return v;
end $$;
revoke execute on function public.demo_pick(text, bigint[], int) from public, anon, authenticated;

-- How many to have in all: the number asked for (null: the limit), never over the limit; 128 at most.
create function public.demo_target(p_count int, p_max int) returns int
language plpgsql immutable set search_path to '' as $$
declare v int := least(coalesce(p_count, p_max), coalesce(p_max, p_count));
begin
  if v is null or v < 1 then raise exception 'Pick how many entries.' using errcode = 'P0001'; end if;
  if v > 128 then raise exception 'At most 128 demo entries.' using errcode = 'P0001'; end if;
  return v;
end $$;
revoke execute on function public.demo_target(int, int) from public, anon, authenticated;

-- A sign-up competition, checked: I'm the office, it exists, and there's no draw yet.
create function public.demo_signup_comp(p_comp bigint) returns public.signup_comps
language plpgsql security definer set search_path to '' as $$
declare c public.signup_comps;
begin
  if not public.is_admin() then raise exception 'Only the club office can add or remove demo entries.' using errcode = '42501'; end if;
  select * into c from public.signup_comps where id = p_comp for update;
  if not found then raise exception 'That competition no longer exists.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.ko_matches where comp_id = p_comp) then
    raise exception 'The draw has been made, so the entries can''t change.' using errcode = 'P0001';
  end if;
  return c;
end $$;
revoke execute on function public.demo_signup_comp(bigint) from public, anon, authenticated;

create function public.demo_fill_signup(p_comp bigint, p_count int) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare c public.signup_comps := public.demo_signup_comp(p_comp); v_have int; v_in bigint[]; v_need int; v_sec text; a bigint[]; b bigint[];
begin
  select count(*), coalesce(array_agg(member_id), '{}') || coalesce(array_agg(partner_id) filter (where partner_id is not null), '{}')
    into v_have, v_in from public.signup_entries where comp_id = p_comp;
  v_need := public.demo_target(p_count, c.max_entries) - v_have;
  if v_need <= 0 then return jsonb_build_object('added', 0); end if;
  v_sec := case when c.category in ('men', 'ladies') then c.category end;
  if c.kind = 'pairs' and c.category = 'mixed' then
    a := public.demo_pick('men', v_in, v_need); b := public.demo_pick('ladies', v_in, v_need);
  elsif c.kind = 'pairs' then
    a := public.demo_pick(v_sec, v_in, v_need * 2); b := a[v_need + 1:]; a := a[1:v_need];
  else
    a := public.demo_pick(v_sec, v_in, v_need);
  end if;
  insert into public.signup_entries (comp_id, member_id, partner_id) select p_comp, a[i], b[i] from generate_series(1, v_need) i;
  return jsonb_build_object('added', v_need);
end $$;

create function public.demo_clear_signup(p_comp bigint) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_n int;
begin
  perform public.demo_signup_comp(p_comp);
  delete from public.signup_entries e where e.comp_id = p_comp
     and exists (select 1 from public.members m where m.demo and m.id in (e.member_id, e.partner_id));
  get diagnostics v_n = row_count;
  return jsonb_build_object('removed', v_n);
end $$;

-- A league or event open for sign-up, checked: I'm the office and it takes sign-ups. (The office can change entrants
-- at any time, as it can by hand.)
create function public.demo_signup_event(p_event bigint) returns public.events
language plpgsql security definer set search_path to '' as $$
declare e public.events;
begin
  if not public.is_admin() then raise exception 'Only the club office can add or remove demo entries.' using errcode = '42501'; end if;
  select * into e from public.events where id = p_event for update;
  if not found then raise exception 'That competition no longer exists.' using errcode = 'P0001'; end if;
  if not e.signup then raise exception 'Only competitions open for sign-up take demo entries.' using errcode = 'P0001'; end if;
  return e;
end $$;
revoke execute on function public.demo_signup_event(bigint) from public, anon, authenticated;

create function public.demo_fill_event(p_event bigint, p_count int) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare e public.events := public.demo_signup_event(p_event); v_need int;
begin
  v_need := public.demo_target(p_count, e.max_entries) - cardinality(e.players);
  if v_need <= 0 then return jsonb_build_object('added', 0); end if;
  update public.events set players = players || public.demo_pick(null, e.players, v_need) where id = p_event;
  return jsonb_build_object('added', v_need);
end $$;

create function public.demo_clear_event(p_event bigint) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare e public.events := public.demo_signup_event(p_event); v_id bigint; v_n int := 0;
begin
  for v_id in select x from unnest(e.players) x join public.members m on m.id = x and m.demo loop
    perform public.take_off_event(p_event, v_id); -- off its teams and captains too
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('removed', v_n);
end $$;

do $$ declare f text; begin
  foreach f in array array['demo_fill_signup(bigint, int)', 'demo_clear_signup(bigint)', 'demo_fill_event(bigint, int)', 'demo_clear_event(bigint)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
