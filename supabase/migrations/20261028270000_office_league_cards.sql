-- Unfinished league cards: the club office can take a player out of a league week (their scores on the card stay,
-- and they can enter a new card that week, e.g. after withdrawing ill), or delete an unfinished card outright (its
-- league entries go with it). Players can only do either before the first hole is saved, so the office sorts it out.

create function public.office_take_out_league(p_event bigint, p_member bigint, p_week int) returns void
language plpgsql security definer set search_path to '' as $$
begin
  if not public.is_admin() then raise exception 'Only the club office can take a player out of a league week.' using errcode = '42501'; end if;
  delete from public.league_entries where event_id = p_event and member_id = p_member and week = p_week;
  if not found then raise exception 'They aren''t entered in that week any more.' using errcode = 'P0001'; end if;
end $$;

create function public.office_delete_league_card(p_round bigint) returns void
language plpgsql security definer set search_path to '' as $$
declare r public.rounds;
begin
  if not public.is_admin() then raise exception 'Only the club office can delete a player''s card.' using errcode = '42501'; end if;
  select * into r from public.rounds where id = p_round for update;
  if not found then raise exception 'That card has already gone.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.league_entries where round_id = p_round) then
    raise exception 'Only league cards can be deleted here.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from jsonb_array_elements(r.done) d where d = 'false') then
    raise exception 'That card is finished. Take a player out of the week instead.' using errcode = 'P0001';
  end if;
  delete from public.rounds where id = p_round; -- its league and event entries go with it
end $$;

do $$ declare f text; begin
  foreach f in array array['office_take_out_league(bigint, bigint, int)', 'office_delete_league_card(bigint)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
