-- Members' balances (competition purse, clubhouse), in pence. Filled from the club's own system once it's linked
-- (source 'club'); until then a member can have example figures to show how it looks (source 'example'), which the
-- app labels as examples. Each member reads only their own.

create table public.member_balances (
  member_id bigint primary key references public.members on delete cascade,
  competition_pence int,
  clubhouse_pence int,
  source text not null default 'example' check (source in ('example', 'club')),
  updated_at timestamptz not null default now()
);
alter table public.member_balances enable row level security;
create policy "my balances" on public.member_balances for select to authenticated using (member_id = public.current_member_id());
grant select on public.member_balances to authenticated;
