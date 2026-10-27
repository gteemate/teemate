-- Paper scorecards, found in review:
-- 1. Deleting a member who uploaded or was asked to confirm a card: the foreign keys set those columns to null,
--    which the guard refused. The guard now lets changes made by other triggers (the foreign keys) through.
-- 2. The player asked to confirm is taken off the card: it's left for the office (they can no longer confirm it).
-- 3. A read is counted once the card has been read; can_read_paper only checks (the function counts afterwards).
-- 4. A confirmed card can't be marked again.

create or replace function public.rounds_paper_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 then return new; end if; -- a foreign key setting a deleted member to null
  if coalesce(current_setting('teemate.paper', true), '') <> 'on'
     and (tg_op = 'INSERT' and (new.paper_by is not null or new.paper_confirmer is not null or new.paper_state is not null or new.paper_note is not null or new.paper_photos <> 0)
          or tg_op = 'UPDATE' and (new.paper_by, new.paper_confirmer, new.paper_state, new.paper_note, new.paper_photos)
                                  is distinct from (old.paper_by, old.paper_confirmer, old.paper_state, old.paper_note, old.paper_photos)) then
    raise exception 'Only the paper scorecard steps can change who confirms a score.' using errcode = '42501';
  end if;
  return new;
end $$;

-- The office confirms it when nobody on the card was asked (or the one asked has left the card).
create function public.paper_for_office(r public.rounds) returns boolean
language sql immutable set search_path to '' as $$
  select r.paper_confirmer is null or not r.lineup @> jsonb_build_array(jsonb_build_object('m', r.paper_confirmer))
$$;

create or replace function public.paper_confirmable(p_round bigint) returns public.rounds
language plpgsql security definer set search_path = '' as $$
declare r public.rounds;
begin
  select * into r from public.rounds where id = p_round for update;
  if not found or r.paper_state is distinct from 'waiting'
     or not (public.is_admin() or (not public.paper_for_office(r) and r.paper_confirmer = public.current_member_id())) then
    raise exception 'Only the person asked to confirm this score can confirm it.' using errcode = '42501';
  end if;
  return r;
end $$;
revoke execute on function public.paper_confirmable(bigint) from public, anon, authenticated;

create or replace function public.my_paper_confirms() returns jsonb
language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'date', r.date, 'paperBy', r.paper_by, 'paperPhotos', r.paper_photos,
           'confirmer', r.paper_confirmer, 'forOffice', public.paper_for_office(r), 'at', r.updated_at,
           'lineup', r.lineup, 'scores', r.scores, 'game', r.game) order by r.date, r.id), '[]')
    from public.rounds r
   where r.paper_state = 'waiting'
     and (case when public.paper_for_office(r) then public.is_admin() else r.paper_confirmer = public.current_member_id() end)
$$;

create or replace function public.mark_paper_card(p_round bigint, p_photos int, p_confirmer bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me bigint := public.current_member_id(); r public.rounds;
begin
  select * into r from public.rounds where id = p_round for update;
  if not found or v_me is null or not r.lineup @> jsonb_build_array(jsonb_build_object('m', v_me)) then
    raise exception 'Only players on this card can do that.' using errcode = '42501';
  end if;
  if r.paper_state = 'confirmed' then raise exception 'This card''s scores are already confirmed.' using errcode = 'P0001'; end if;
  if p_confirmer = v_me then raise exception 'Someone else has to confirm your own score.' using errcode = 'P0001'; end if;
  if p_confirmer is not null and not r.lineup @> jsonb_build_array(jsonb_build_object('m', p_confirmer)) then
    raise exception 'The person confirming your score has to be on this card.' using errcode = 'P0001';
  end if;
  perform set_config('teemate.paper', 'on', true);
  update public.rounds set paper_by = v_me, paper_confirmer = p_confirmer, paper_state = 'waiting', paper_note = null,
         paper_photos = least(greatest(coalesce(p_photos, 0), 0), 2)
   where id = p_round;
  perform set_config('teemate.paper', '', true);
end $$;

-- Before the read: is the setting on, and has the member reads left today? Nothing is counted.
create function public.can_read_paper() returns void
language plpgsql security definer set search_path = '' as $$
declare v_me bigint := public.current_member_id();
begin
  if v_me is null then raise exception 'Only members can read scorecards.' using errcode = '42501'; end if;
  if not (select paper_cards from public.club_settings where id = 1) then
    raise exception 'Paper scorecards are switched off at this club.' using errcode = 'P0001';
  end if;
  if coalesce((select n from public.paper_reads where member_id = v_me and day = public.club_today()), 0) >= 10 then
    raise exception 'You''ve read 10 cards today. Enter the scores by hand, or try again tomorrow.' using errcode = 'P0001';
  end if;
end $$;
revoke execute on function public.can_read_paper() from public, anon;
grant execute on function public.can_read_paper() to authenticated;
