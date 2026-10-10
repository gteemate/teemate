-- Entry fees: the club office sets a cost on a club competition (sign-up competitions and club events) and says how
-- fees are paid (taken from the competition purse, or in the pro shop). Members see the fee when they enter.
-- Balances themselves stay in the club's own system for now; the app has a place for them once it's linked.

alter table public.signup_comps add column entry_fee_pence int check (entry_fee_pence between 0 and 100000);
alter table public.events add column entry_fee_pence int check (entry_fee_pence between 0 and 100000);
alter table public.club_settings add column fee_payment text not null default 'shop' check (fee_payment in ('shop', 'purse'));

create or replace function public.get_theme()
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('main', colour_main, 'accent', colour_accent, 'name', club_name,
                            'courseLat', course_lat, 'courseLon', course_lon, 'coursePlace', course_place, 'feePayment', fee_payment)
    from public.club_settings where id = 1
$$;

create function public.admin_set_fee_payment(p text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only the club office can change this.' using errcode = '42501'; end if;
  if p not in ('shop', 'purse') then raise exception 'Pick the pro shop or the competition purse.' using errcode = 'P0001'; end if;
  update public.club_settings set fee_payment = p where id = 1;
end $$;
revoke execute on function public.admin_set_fee_payment(text) from public, anon;
grant execute on function public.admin_set_fee_payment(text) to authenticated;

-- Running a template also sets this year's entry fee.
drop function public.admin_run_signup(bigint, date, date, int, text);
create function public.admin_run_signup(p_comp bigint, p_closes date, p_final date, p_max int default null, p_notes text default null, p_fee int default null) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.signup_comps;
begin
  if not public.is_admin() then raise exception 'Only the club office can run club competitions.' using errcode = '42501'; end if;
  select * into c from public.signup_comps where id = p_comp for update;
  if not found or c.created_by is not null then raise exception 'That isn''t a club competition.' using errcode = 'P0001'; end if;
  if p_closes is null or p_closes < current_date then raise exception 'Entries have to close today or later.' using errcode = 'P0001'; end if;
  if p_final is null or p_final <= p_closes then raise exception 'The final has to be after entries close.' using errcode = 'P0001'; end if;
  if p_max is not null and p_max < 2 then raise exception 'A limit needs at least 2 places.' using errcode = 'P0001'; end if;
  if p_fee is not null and (p_fee < 0 or p_fee > 100000) then raise exception 'That entry fee doesn''t look right.' using errcode = 'P0001'; end if;
  delete from public.ko_matches where comp_id = p_comp;
  delete from public.signup_entries where comp_id = p_comp;
  delete from public.signup_declines where comp_id = p_comp;
  update public.signup_comps set open = true, closes_on = p_closes, final_by = p_final, max_entries = p_max,
         notes = nullif(trim(left(coalesce(p_notes, ''), 300)), ''), draw_published = false, round_deadlines = '{}',
         entry_fee_pence = nullif(p_fee, 0)
   where id = p_comp;
end $$;
revoke execute on function public.admin_run_signup(bigint, date, date, int, text, int) from public, anon;
grant execute on function public.admin_run_signup(bigint, date, date, int, text, int) to authenticated;
