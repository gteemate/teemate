-- Find a time, after review: members can't use the player lookup to see who's in other matches (the read rules ask
-- "do I play in this match?" instead); an answer that breaks "everyone can" takes back its unseen notice; a result
-- entered takes back the unseen "suggests times" notices.

create function public.plays_in_ko_match(p_match bigint) returns boolean
language sql stable security definer set search_path to '' as $$ select public.current_member_id() = any(public.ko_match_players(p_match)) $$;
revoke execute on function public.plays_in_ko_match(bigint) from public, anon;
grant execute on function public.plays_in_ko_match(bigint) to authenticated;

drop policy "players see their match's times" on public.match_times;
drop policy "players see their match's answers" on public.match_time_answers;
create policy "players see their match's times" on public.match_times for select to authenticated
  using (public.plays_in_ko_match(ko_match_id) or public.is_admin());
create policy "players see their match's answers" on public.match_time_answers for select to authenticated
  using (exists (select 1 from public.match_times t where t.id = time_id and (public.plays_in_ko_match(t.ko_match_id) or public.is_admin())));
revoke execute on function public.ko_match_players(bigint) from authenticated;

create or replace function public.answer_match_time(p_time bigint, p_can boolean) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_me bigint := public.current_member_id(); t public.match_times; m public.ko_matches; v_players bigint[]; v_agreed boolean := false;
begin
  select * into t from public.match_times where id = p_time;
  if not found then raise exception 'That day is no longer suggested.' using errcode = 'P0001'; end if;
  m := public.ko_match_to_arrange(t.ko_match_id);
  v_players := public.ko_match_players(m.id);
  if p_can is null then delete from public.match_time_answers where time_id = t.id and member_id = v_me;
  else insert into public.match_time_answers (time_id, member_id, can) values (t.id, v_me, p_can)
         on conflict (time_id, member_id) do update set can = excluded.can;
  end if;
  v_agreed := t.day >= public.club_today()
    and (select count(*) from public.match_time_answers a where a.time_id = t.id and a.can and a.member_id = any(v_players)) = cardinality(v_players);
  if not v_agreed then
    -- not (or no longer) everyone: an unseen "everyone can do" for this day would be wrong now
    delete from public.booking_notices where kind = 'agreed' and ko_match_id = m.id and date = t.day and part = t.part and not seen;
  elsif p_can then
    -- everyone in the match can do it: tell them all (once per suggestion, for the players it has now)
    if not exists (select 1 from public.booking_notices where kind = 'agreed' and ko_match_id = m.id and date = t.day and part = t.part and member_id = any(v_players)) then
      insert into public.booking_notices (member_id, kind, date, old_time, note, part, ko_match_id)
        select x, 'agreed', t.day, 0, (select name from public.signup_comps where id = m.comp_id), t.part, m.id from unnest(v_players) x;
    end if;
  end if;
  return jsonb_build_object('agreed', v_agreed);
end $$;

create or replace function public.clear_match_times() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.status = 'reported' and old.status is distinct from new.status then -- a result entered: no more "suggests times"
    delete from public.booking_notices where ko_match_id = new.id and kind = 'times' and not seen;
  end if;
  if new.status in ('confirmed', 'bye') and old.status is distinct from new.status
     or new.a_entry is distinct from old.a_entry or new.b_entry is distinct from old.b_entry then
    delete from public.match_times where ko_match_id = new.id;
    delete from public.booking_notices where ko_match_id = new.id and kind in ('times', 'agreed') and not seen;
  end if;
  return null;
end $$;
