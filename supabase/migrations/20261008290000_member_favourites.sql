-- Personal favourites in Members & access: each person stars the members they deal with most.
create table public.member_favourites (
  member_id bigint not null references public.members on delete cascade,  -- whose favourite it is
  fav_id bigint not null references public.members on delete cascade,     -- the starred member
  primary key (member_id, fav_id)
);
alter table public.member_favourites enable row level security;
revoke all on public.member_favourites from anon;
create policy "own favourites" on public.member_favourites for all to authenticated
  using (member_id = public.current_member_id()) with check (member_id = public.current_member_id());
