-- Open holes: any event (and each of its days, or a league's weeks) and each knockout round can be played on the
-- holes picked, e.g. 1–6 and 10–12. Stored as a list of hole numbers; null is all 18. Match days saved before keep a
-- number (holes 1 to n). And club event templates: the club office saves an event's settings to run again on a day.

create function public.holes_problem(p jsonb) returns text
language plpgsql immutable set search_path to '' as $$
begin
  if p is null or jsonb_typeof(p) = 'null' then return null; end if;
  if jsonb_typeof(p) = 'number' and (p #>> '{}') in ('18', '14', '12', '9', '6') then return null; end if; -- older match days
  if jsonb_typeof(p) = 'array' and jsonb_array_length(p) between 1 and 18
     and not exists (select 1 from jsonb_array_elements(p) x where jsonb_typeof(x) <> 'number' or (x #>> '{}') !~ '^([1-9]|1[0-8])$')
     and (select count(distinct x) from jsonb_array_elements(p) x) = jsonb_array_length(p) then
    return null;
  end if;
  return 'Pick at least one hole, from 1 to 18.';
end $$;

-- The event's points and each day's (or league week's) settings: a day of the event, holes as above, points.
create or replace function public.match_rules_problem(p_points jsonb, p_day_rules jsonb, p_days int) returns text
language plpgsql immutable set search_path to '' as $$
declare d record; v_problem text;
begin
  v_problem := public.points_problem(p_points);
  if v_problem is not null then return v_problem; end if;
  if p_day_rules is null then return null; end if;
  if jsonb_typeof(p_day_rules) <> 'object' then return 'A match day has holes and points only.'; end if;
  for d in select key, value from jsonb_each(p_day_rules) loop
    if d.key !~ '^[0-9]+$' or d.key::int < 1 or (p_days is not null and d.key::int > p_days) then
      return 'Those settings aren''t for a match day in this event.';
    end if;
    if jsonb_typeof(d.value) <> 'object' or exists (select 1 from jsonb_object_keys(d.value) x where x not in ('holes', 'points')) then
      return 'A match day has holes and points only.';
    end if;
    v_problem := public.holes_problem(d.value->'holes');
    if v_problem is not null then return v_problem; end if;
    v_problem := public.points_problem(d.value->'points');
    if v_problem is not null then return v_problem; end if;
  end loop;
  return null;
end $$;

-- A league's settings are per week.
alter table public.events drop constraint event_match_rules;
alter table public.events add constraint event_match_rules check (public.match_rules_problem(points, day_rules, greatest(days, coalesce(weeks, 0))) is null);

alter table public.events add column holes jsonb constraint event_holes check (public.holes_problem(holes) is null);
grant select (holes) on public.events to authenticated;

-- Knockouts: each round's holes, { "<round>": [holes] }, set by an admin or the knockout's organiser.
create function public.round_holes_problem(p jsonb) returns text
language plpgsql immutable set search_path to '' as $$
declare r record;
begin
  if p is null then return null; end if;
  if jsonb_typeof(p) <> 'object' then return 'Pick at least one hole, from 1 to 18.'; end if;
  for r in select key, value from jsonb_each(p) loop
    if r.key !~ '^[1-9][0-9]*$' then return 'That isn''t a round of this knockout.'; end if;
    if public.holes_problem(r.value) is not null then return public.holes_problem(r.value); end if;
  end loop;
  return null;
end $$;
alter table public.signup_comps add column round_holes jsonb constraint ko_round_holes check (public.round_holes_problem(round_holes) is null);

create function public.set_ko_round_holes(p_comp bigint, p_round int, p_holes jsonb) returns void
language plpgsql security definer set search_path to '' as $$
begin
  if not (public.is_admin() or public.ko_organiser(p_comp)) then
    raise exception 'Only the knockout''s organiser (or an admin) sets its holes.' using errcode = '42501';
  end if;
  if p_round is null or p_round < 1 then raise exception 'That isn''t a round of this knockout.' using errcode = 'P0001'; end if;
  if public.holes_problem(p_holes) is not null then raise exception '%', public.holes_problem(p_holes) using errcode = 'P0001'; end if;
  update public.signup_comps set round_holes = case
      when p_holes is null or jsonb_typeof(p_holes) = 'null' then nullif(coalesce(round_holes, '{}') - p_round::text, '{}'::jsonb)
      else coalesce(round_holes, '{}') || jsonb_build_object(p_round::text, p_holes) end
    where id = p_comp;
end $$;
revoke execute on function public.set_ko_round_holes(bigint, int, jsonb) from public, anon;
grant execute on function public.set_ko_round_holes(bigint, int, jsonb) to authenticated;

-- Club event templates: an event's settings without its date or players, run again on any day. Club office only.
create table public.event_templates (
  id bigserial primary key,
  name text not null check (char_length(trim(name)) between 1 and 60),
  setup jsonb not null check (jsonb_typeof(setup) = 'object'),
  created_at timestamptz not null default now()
);
alter table public.event_templates enable row level security;
create policy "admins keep them" on public.event_templates for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.event_templates from public, anon;
grant select, insert, update, delete on public.event_templates to authenticated;
grant usage on sequence public.event_templates_id_seq to authenticated;

insert into public.data_versions (kind) values ('templates') on conflict do nothing;
create trigger bump_event_templates_version after insert or update or delete on public.event_templates
  for each statement execute function public.bump_version('templates');

-- Saving an event: holes and day settings refused with their plain message (the checks above stay as a backstop).
create function public.event_rules_message() returns trigger
language plpgsql set search_path to '' as $$
declare v_problem text;
begin
  v_problem := coalesce(public.holes_problem(new.holes), public.match_rules_problem(new.points, new.day_rules, greatest(new.days, coalesce(new.weeks, 0))));
  if v_problem is not null then raise exception '%', v_problem using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger event_rules_message before insert or update on public.events for each row execute function public.event_rules_message();
