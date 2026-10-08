-- Events set up in advance, by any player. Scored live from each player's own card on the day.
--
-- style  'ryder'      two teams; pairs play better-ball matches drawn per day (fmt bbl | bbstab | bbscr)
--        'teams'      two teams; everyone's Stableford counts for their team (fmt teamstab)
--        'individual' leaderboard of everyone (fmt stab | net)
-- club   true = a club event: everyone sees it (only admins can make one). false = only its players
--        (and whoever set it up) see it.
-- team   { "<member id>": "A" | "B" }      matches  { "1": [{ "a": [id, id], "b": [id, id] }], "2": [...] }
-- The person who set it up can change or delete it until the first day; admins can at any time.

alter table public.events
  add column created_by bigint references public.members on delete set null,
  add column start_date date,
  add column style text,
  add column fmt text,
  add column club boolean not null default false;

-- The sample Autumn Cup becomes a club event starting today, owned by the first admin.
update public.events set
  created_by = (select id from public.members where admin order by id limit 1),
  start_date = current_date, style = 'ryder', club = true,
  fmt = case format when 'Better ball · Stableford' then 'bbstab' when 'Better ball · scratch' then 'bbscr' else 'bbl' end,
  -- results now come from cards, so drop the made-up ones; keep pairs and tee times
  matches = coalesce((select jsonb_object_agg(d, (select jsonb_agg(m - 'res') from jsonb_array_elements(ms) m)) from jsonb_each(matches) x(d, ms)), '{}');

alter table public.events
  alter column start_date set not null, alter column style set not null, alter column fmt set not null,
  add constraint event_style check (style in ('ryder', 'teams', 'individual')),
  add constraint event_fmt check (
    (style = 'ryder' and fmt in ('bbl', 'bbstab', 'bbscr')) or (style = 'teams' and fmt = 'teamstab') or (style = 'individual' and fmt in ('stab', 'net'))),
  add constraint event_name check (length(trim(name)) between 1 and 60);
alter table public.events alter column created_by set default public.current_member_id();
alter table public.events alter column team_a set default '{"name":"Blues","col":"#19335A"}', alter column team_b set default '{"name":"Reds","col":"#762A43"}',
  alter column course set default 'Ailsa · White tees', alter column format set default '';
drop index public.one_active_event;
alter table public.events drop column active;
drop function public.set_active_event(bigint, boolean);

drop policy "members read" on public.events;
drop policy "admin writes" on public.events;
create policy "see club events, mine, and ones I'm in" on public.events for select to authenticated
  using (club or public.is_admin() or created_by = public.current_member_id() or public.current_member_id() = any(players));
create policy "create my own (club events: admins)" on public.events for insert to authenticated
  with check (created_by = public.current_member_id() and (not club or public.is_admin()));
create policy "change my own before it starts (admins any time)" on public.events for update to authenticated
  using (public.is_admin() or (created_by = public.current_member_id() and start_date > current_date))
  with check (public.is_admin() or (created_by = public.current_member_id() and not club and start_date > current_date));
create policy "delete my own before it starts (admins any time)" on public.events for delete to authenticated
  using (public.is_admin() or (created_by = public.current_member_id() and start_date > current_date));
grant insert, update, delete on public.events to authenticated;
