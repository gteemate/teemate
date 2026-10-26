-- Data stamps: one per kind of data the app keeps on phones and the club office iPad. The database moves a kind's
-- stamp whenever one of its tables changes; the app asks for all of them in one call (data_versions()) and refetches
-- only the kinds whose stamp moved.

create table public.data_versions (kind text primary key, changed_at timestamptz not null default clock_timestamp());
alter table public.data_versions enable row level security;
revoke all on public.data_versions from public, anon, authenticated;
insert into public.data_versions (kind) values ('members'), ('course'), ('pins'), ('games'), ('events'), ('club'), ('comps'), ('requests'), ('friends');

create function public.bump_version() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  update public.data_versions set changed_at = clock_timestamp() where kind = tg_argv[0];
  return null;
end $$;
revoke execute on function public.bump_version() from public, anon, authenticated;

do $$ declare r record; begin
  for r in select * from (values ('members', 'members'), ('courses', 'course'), ('tees', 'course'), ('holes', 'course'), ('pin_sheets', 'pins'),
      ('game_settings', 'games'), ('game_prefs', 'games'), ('member_game_prefs', 'games'), ('events', 'events'), ('club_settings', 'club'),
      ('signup_comps', 'comps'), ('signup_entries', 'comps'), ('ko_matches', 'comps'), ('access_requests', 'requests'), ('tee_time_requests', 'requests'),
      ('buddies', 'friends'), ('friend_contacts', 'friends'), ('member_favourites', 'friends')) x(tbl, kind) loop
    execute format('create trigger bump_%s_version after insert or update or delete on public.%I for each statement execute function public.bump_version(%L)', r.tbl, r.tbl, r.kind);
  end loop;
end $$;

-- All the stamps, { kind: changed_at }, for a signed-in member (nothing in them about anyone).
create function public.data_versions() returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_object_agg(kind, changed_at) from public.data_versions where public.current_member_id() is not null
$$;
revoke execute on function public.data_versions() from public, anon;
grant execute on function public.data_versions() to authenticated;
