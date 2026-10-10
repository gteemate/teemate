-- Club competitions as templates: the office re-runs one each season (new dates, opened to members), which clears
-- last time's entries, draw and "no thanks" answers. Members answer each open competition Enter or No thanks; a
-- No thanks moves it to their Declined list, where they can still enter until entries close.

alter table public.signup_comps add column final_by date; -- when the final has to be played by (the draw spreads the rounds to it)

create table public.signup_declines (
  comp_id bigint not null references public.signup_comps (id) on delete cascade,
  member_id bigint not null references public.members (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comp_id, member_id)
);
alter table public.signup_declines enable row level security;
create policy "my no-thanks" on public.signup_declines for select to authenticated using (member_id = public.current_member_id());
grant select on public.signup_declines to authenticated;

create function public.decline_signup(p_comp bigint) returns void
language sql security definer set search_path = '' as $$
  insert into public.signup_declines (comp_id, member_id) select p_comp, public.current_member_id()
   where public.current_member_id() is not null and exists (select 1 from public.signup_comps where id = p_comp and open)
  on conflict do nothing
$$;
create function public.undecline_signup(p_comp bigint) returns void
language sql security definer set search_path = '' as $$
  delete from public.signup_declines where comp_id = p_comp and member_id = public.current_member_id()
$$;

-- Run a club competition (again): open it with new dates; last time's entries, draw and answers go.
create function public.admin_run_signup(p_comp bigint, p_closes date, p_final date, p_max int default null, p_notes text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.signup_comps;
begin
  if not public.is_admin() then raise exception 'Only the club office can run club competitions.' using errcode = '42501'; end if;
  select * into c from public.signup_comps where id = p_comp for update;
  if not found or c.created_by is not null then raise exception 'That isn''t a club competition.' using errcode = 'P0001'; end if;
  if p_closes is null or p_closes < current_date then raise exception 'Entries have to close today or later.' using errcode = 'P0001'; end if;
  if p_final is null or p_final <= p_closes then raise exception 'The final has to be after entries close.' using errcode = 'P0001'; end if;
  if p_max is not null and p_max < 2 then raise exception 'A limit needs at least 2 places.' using errcode = 'P0001'; end if;
  delete from public.ko_matches where comp_id = p_comp;
  delete from public.signup_entries where comp_id = p_comp;
  delete from public.signup_declines where comp_id = p_comp;
  update public.signup_comps set open = true, closes_on = p_closes, final_by = p_final, max_entries = p_max,
         notes = nullif(trim(left(coalesce(p_notes, ''), 300)), ''), draw_published = false, round_deadlines = '{}'
   where id = p_comp;
end $$;

do $$ declare f text; begin
  foreach f in array array['decline_signup(bigint)', 'undecline_signup(bigint)', 'admin_run_signup(bigint, date, date, int, text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
