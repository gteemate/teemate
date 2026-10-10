-- Friends from other clubs (contact cards saved from a friend link), and favourites: each member's own list.

create table public.friend_contacts (
  id bigserial primary key,
  owner bigint not null references public.members (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  club text check (char_length(club) <= 80),
  hcp text check (char_length(hcp) <= 8),
  gui text check (char_length(gui) <= 20),
  shared_on date,
  favourite boolean not null default false,
  updated_at timestamptz not null default now()
);
create index on public.friend_contacts (owner);
alter table public.friend_contacts enable row level security;
create policy "own contacts" on public.friend_contacts for all to authenticated
  using (owner = public.current_member_id()) with check (owner = public.current_member_id());
revoke all on public.friend_contacts from public, anon;
grant select, insert, update, delete on public.friend_contacts to authenticated;
grant usage on sequence public.friend_contacts_id_seq to authenticated;

-- Star the friends you play with most: they come first when you pick players.
alter table public.buddies add column favourite boolean not null default false;
create policy "update own buddies" on public.buddies for update to authenticated
  using (member_id = public.current_member_id()) with check (member_id = public.current_member_id());
grant update (favourite) on public.buddies to authenticated;
