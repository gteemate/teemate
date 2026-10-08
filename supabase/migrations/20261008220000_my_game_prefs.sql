-- Each player's own preferred game for 2-, 3- and 4-ball cards. A new card starts on it.
-- (The club's settings still decide which games exist and their allowances.)

create table public.member_game_prefs (
  member_id bigint not null references public.members on delete cascade,
  group_size int not null check (group_size between 2 and 4),
  game_key text not null,
  primary key (member_id, group_size)
);
alter table public.member_game_prefs enable row level security;
revoke all on public.member_game_prefs from anon;
create policy "own preferences" on public.member_game_prefs for all to authenticated
  using (member_id = public.current_member_id()) with check (member_id = public.current_member_id());
