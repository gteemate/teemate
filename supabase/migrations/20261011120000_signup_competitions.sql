-- Sign-up competitions (step 1): the club's season competitions that members put their names down for, alone or
-- with a partner, until entries close. Eligibility comes from the section each member plays in (Men's / Ladies').
-- The draw and play-by dates come later.

alter table public.members add column plays_in text check (plays_in in ('men', 'ladies'));
grant select (plays_in) on public.members to authenticated;

create function public.set_my_plays_in(p text) returns void
language plpgsql security definer set search_path to '' as $$
begin
  if public.current_member_id() is null then raise exception 'Only members can set this.' using errcode = '42501'; end if;
  if p is not null and p not in ('men', 'ladies') then raise exception 'Choose Men''s or Ladies''.' using errcode = 'P0001'; end if;
  update public.members set plays_in = p where id = public.current_member_id();
end $$;

create function public.admin_set_plays_in(p_member bigint, p text) returns void
language plpgsql security definer set search_path to '' as $$
begin
  if not public.is_admin() then raise exception 'Only admins can change another member''s section.' using errcode = '42501'; end if;
  if p is not null and p not in ('men', 'ladies') then raise exception 'Choose Men''s or Ladies''.' using errcode = 'P0001'; end if;
  update public.members set plays_in = p where id = p_member;
end $$;

create table public.signup_comps (
  id bigserial primary key,
  name text not null check (char_length(trim(name)) between 1 and 60),
  category text not null check (category in ('men', 'ladies', 'mixed', 'open')),
  kind text not null check (kind in ('singles', 'pairs')),
  closes_on date,
  notes text check (char_length(notes) <= 300),
  open boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.signup_comps enable row level security;
create policy "members see open ones, admins all" on public.signup_comps for select to authenticated using (open or public.is_admin());
create policy "admins keep them" on public.signup_comps for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.signup_comps from public, anon;
grant select, insert, update, delete on public.signup_comps to authenticated;
grant usage on sequence public.signup_comps_id_seq to authenticated;

create table public.signup_entries (
  id bigserial primary key,
  comp_id bigint not null references public.signup_comps (id) on delete cascade,
  member_id bigint not null references public.members (id) on delete cascade,
  partner_id bigint references public.members (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (comp_id, member_id)
);
create unique index on public.signup_entries (comp_id, partner_id) where partner_id is not null;
alter table public.signup_entries enable row level security;
create policy "my entries, or all for admins" on public.signup_entries for select to authenticated
  using (member_id = public.current_member_id() or partner_id = public.current_member_id() or public.is_admin());
revoke all on public.signup_entries from public, anon;
grant select on public.signup_entries to authenticated;

-- Enter (with a partner for pairs). Checks: open, not closed, eligible (both), nobody entered twice.
create function public.enter_signup(p_comp bigint, p_partner bigint) returns void
language plpgsql security definer set search_path to '' as $$
declare v_me bigint := public.current_member_id(); c public.signup_comps; v_mine text; v_theirs text;
begin
  if v_me is null then raise exception 'Only members can enter.' using errcode = '42501'; end if;
  select * into c from public.signup_comps where id = p_comp and open for update;
  if not found then raise exception 'That competition isn''t open for entries.' using errcode = 'P0001'; end if;
  if c.closes_on is null or current_date > c.closes_on then raise exception 'Entries have closed for %.', c.name using errcode = 'P0001'; end if;
  if c.kind = 'singles' and p_partner is not null then raise exception '% is a singles competition.', c.name using errcode = 'P0001'; end if;
  if c.kind = 'pairs' and (p_partner is null or p_partner = v_me) then raise exception 'Pick your partner for %.', c.name using errcode = 'P0001'; end if;
  select plays_in into v_mine from public.members where id = v_me;
  if p_partner is not null then
    select plays_in into v_theirs from public.members where id = p_partner;
    if not found then raise exception 'That partner isn''t a member.' using errcode = 'P0001'; end if;
  end if;
  if c.category in ('men', 'ladies') then
    if v_mine is null then raise exception 'Set Men''s or Ladies'' in your Account first.' using errcode = 'P0001'; end if;
    if v_mine <> c.category or (p_partner is not null and coalesce(v_theirs, '') <> c.category) then
      raise exception 'That entry isn''t eligible for %.', c.name using errcode = 'P0001';
    end if;
  elsif c.category = 'mixed' then
    if v_mine is null then raise exception 'Set Men''s or Ladies'' in your Account first.' using errcode = 'P0001'; end if;
    if p_partner is not null and (v_theirs is null or v_theirs = v_mine) then raise exception 'A mixed pair is one man and one lady.' using errcode = 'P0001'; end if;
  end if;
  if exists (select 1 from public.signup_entries e where e.comp_id = c.id and (e.member_id in (v_me, p_partner) or e.partner_id in (v_me, p_partner))) then
    raise exception 'You or your partner are already entered in %.', c.name using errcode = 'P0001';
  end if;
  insert into public.signup_entries (comp_id, member_id, partner_id) values (c.id, v_me, p_partner);
end $$;

-- Withdraw (either of a pair: the pair comes out), until entries close.
create function public.withdraw_signup(p_comp bigint) returns void
language plpgsql security definer set search_path to '' as $$
declare v_me bigint := public.current_member_id(); c public.signup_comps;
begin
  select * into c from public.signup_comps where id = p_comp;
  if not found then raise exception 'That competition no longer exists.' using errcode = 'P0001'; end if;
  if c.closes_on is not null and current_date > c.closes_on then raise exception 'Entries have closed. Speak to the competition secretary.' using errcode = 'P0001'; end if;
  delete from public.signup_entries where comp_id = p_comp and (member_id = v_me or partner_id = v_me);
end $$;

do $$ declare f text; begin
  foreach f in array array['set_my_plays_in(text)', 'admin_set_plays_in(bigint, text)', 'enter_signup(bigint, bigint)', 'withdraw_signup(bigint)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- The club's season competitions, hidden until an admin sets the closing dates and opens them.
insert into public.signup_comps (name, category, kind) values
  ('Men''s Match Play', 'men', 'singles'), ('Men''s Fourball', 'men', 'pairs'), ('Men''s Foursome', 'men', 'pairs'),
  ('Mixed Foursome', 'mixed', 'pairs'), ('Mixed Fourball', 'mixed', 'pairs'),
  ('Ladies Singles', 'ladies', 'singles'), ('Ladies Fourball', 'ladies', 'pairs'), ('Ladies Foursome', 'ladies', 'pairs');
