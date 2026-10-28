-- The club office tidies a member's guests this year: a guest may come 6 times a year, and the same person can be
-- typed differently ("G Cochrane", "Gary Cochrane"). The member page flags likely matches; the office merges them
-- (this year's visits under one name) or says they're different people (the pair isn't flagged again).

create table public.guest_not_same (
  member_id bigint not null references public.members on delete cascade,
  a text not null, -- the two names, tidied (lower case, single spaces), a < b
  b text not null,
  primary key (member_id, a, b),
  check (a < b)
);
alter table public.guest_not_same enable row level security;
create policy "admin reads" on public.guest_not_same for select to authenticated using (public.is_admin());
grant select on public.guest_not_same to authenticated;

create function public.tidy_guest_name(p text) returns text language sql immutable set search_path = '' as $$
  select lower(regexp_replace(trim(coalesce(p, '')), '\s+', ' ', 'g'))
$$;

-- Merge: this year's visits of p_from become p_to (as the office typed it). → how many visits moved
create function public.office_merge_guests(p_member bigint, p_from text, p_to text) returns integer
language plpgsql security definer set search_path to '' as $$
declare v_to text := regexp_replace(trim(coalesce(p_to, '')), '\s+', ' ', 'g'); v_n int;
begin
  if not public.is_admin() then raise exception 'Only the club office can merge guests.' using errcode = '42501'; end if;
  if v_to = '' then raise exception 'Say which name to keep.' using errcode = 'P0001'; end if;
  if public.tidy_guest_name(p_from) = public.tidy_guest_name(v_to) then raise exception 'Those are already the same name.' using errcode = 'P0001'; end if;
  update public.guest_visits set guest_name = v_to
   where member_id = p_member and public.tidy_guest_name(guest_name) = public.tidy_guest_name(p_from)
     and date >= date_trunc('year', public.club_today())::date;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'There are no visits under that name this year.' using errcode = 'P0001'; end if;
  return v_n;
end $$;

-- Different people: the pair isn't flagged again.
create function public.office_guests_not_same(p_member bigint, p_a text, p_b text) returns void
language plpgsql security definer set search_path to '' as $$
declare x text := public.tidy_guest_name(p_a); y text := public.tidy_guest_name(p_b);
begin
  if not public.is_admin() then raise exception 'Only the club office can do that.' using errcode = '42501'; end if;
  if x = '' or y = '' or x = y then raise exception 'Pick two different names.' using errcode = 'P0001'; end if;
  insert into public.guest_not_same (member_id, a, b) values (p_member, least(x, y), greatest(x, y)) on conflict do nothing;
end $$;

do $$ declare f text; begin
  foreach f in array array['office_merge_guests(bigint, text, text)', 'office_guests_not_same(bigint, text, text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
