-- Club events and leagues: choose who sees them — all members, or only the entrants.
--   club     = a club event (run by admins; listed under Club admin → Club events)
--   everyone = every member can see it (otherwise only its entrants, its creator and admins)

alter table public.events add column everyone boolean not null default false;
update public.events set everyone = club;                 -- existing club events were visible to all
update public.events set club = true where style = 'league'; -- leagues are club events

drop policy "see club events, mine, and ones I'm in" on public.events;
create policy "see all-member events, mine, and ones I'm in" on public.events for select to authenticated
  using (everyone or public.is_admin() or created_by = public.current_member_id() or public.current_member_id() = any(players));

drop policy "create my own (club events and leagues: admins)" on public.events;
create policy "create my own (club events, all-member events and leagues: admins)" on public.events for insert to authenticated
  with check (created_by = public.current_member_id() and ((not club and not everyone) or public.is_admin()) and public.event_is_league_ok(style));

drop policy "change my own before it starts (admins any time)" on public.events;
create policy "change my own before it starts (admins any time)" on public.events for update to authenticated
  using (public.is_admin() or (created_by = public.current_member_id() and start_date > current_date))
  with check (public.is_admin() or (created_by = public.current_member_id() and not club and not everyone and start_date > current_date));
