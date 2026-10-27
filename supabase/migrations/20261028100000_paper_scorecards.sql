-- Paper scorecards: a group that played on paper photographs its cards after the round; the app reads the scores
-- (the read-scorecard function), the uploader checks every player, and a playing partner or the club office
-- confirms the uploader's own score. The office switches it on. Only the cropped score grid is ever stored.
--
-- Everyone but the uploader is confirmed by the uploader when the card is saved, so a card has one confirmation
-- at most: paper_by (the uploader), paper_confirmer (a member; null = the club office), paper_state, paper_note.
-- Players can edit their card's scores as before, but only the functions below change these columns.

alter table public.club_settings add column paper_cards boolean not null default false;

create or replace function public.get_theme()
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('main', colour_main, 'accent', colour_accent, 'name', club_name,
                            'courseLat', course_lat, 'courseLon', course_lon, 'coursePlace', course_place, 'feePayment', fee_payment,
                            'dayBoardDays', to_jsonb(day_board_days), 'dayBoardToday', day_board_today, 'paperCards', paper_cards)
    from public.club_settings where id = 1
$$;

create function public.admin_set_paper_cards(p boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only the club office can change this.' using errcode = '42501'; end if;
  update public.club_settings set paper_cards = coalesce(p, false) where id = 1;
end $$;
revoke execute on function public.admin_set_paper_cards(boolean) from public, anon;
grant execute on function public.admin_set_paper_cards(boolean) to authenticated;

alter table public.rounds add column paper_by bigint references public.members on delete set null;
alter table public.rounds add column paper_confirmer bigint references public.members on delete set null;
alter table public.rounds add column paper_state text check (paper_state in ('waiting', 'confirmed', 'sent_back'));
alter table public.rounds add column paper_note text check (char_length(paper_note) <= 200);
alter table public.rounds add column paper_photos smallint not null default 0 check (paper_photos between 0 and 2);

-- Only the paper functions (which set teemate.paper for their own transaction) may change the paper columns.
create function public.rounds_paper_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('teemate.paper', true), '') <> 'on'
     and (tg_op = 'INSERT' and (new.paper_by is not null or new.paper_state is not null or new.paper_photos <> 0)
          or tg_op = 'UPDATE' and (new.paper_by, new.paper_confirmer, new.paper_state, new.paper_note, new.paper_photos)
                                  is distinct from (old.paper_by, old.paper_confirmer, old.paper_state, old.paper_note, old.paper_photos)) then
    raise exception 'Only the paper scorecard steps can change who confirms a score.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger rounds_paper_guard before insert or update on public.rounds for each row execute function public.rounds_paper_guard();

create function public.mark_paper_card(p_round bigint, p_photos int, p_confirmer bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me bigint := public.current_member_id(); r public.rounds;
begin
  select * into r from public.rounds where id = p_round for update;
  if not found or v_me is null or not r.lineup @> jsonb_build_array(jsonb_build_object('m', v_me)) then
    raise exception 'Only players on this card can do that.' using errcode = '42501';
  end if;
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

-- The chosen confirmer, or the club office (always).
create function public.paper_confirmable(p_round bigint) returns public.rounds
language plpgsql security definer set search_path = '' as $$
declare r public.rounds;
begin
  select * into r from public.rounds where id = p_round for update;
  if not found or r.paper_state is distinct from 'waiting'
     or not (public.is_admin() or (r.paper_confirmer is not null and r.paper_confirmer = public.current_member_id())) then
    raise exception 'Only the person asked to confirm this score can confirm it.' using errcode = '42501';
  end if;
  return r;
end $$;
revoke execute on function public.paper_confirmable(bigint) from public, anon, authenticated;

create function public.confirm_paper_score(p_round bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.paper_confirmable(p_round);
  perform set_config('teemate.paper', 'on', true);
  update public.rounds set paper_state = 'confirmed', paper_note = null, paper_confirmer = case when public.is_admin()
         and paper_confirmer is distinct from public.current_member_id() then null else paper_confirmer end
   where id = p_round;
  perform set_config('teemate.paper', '', true);
end $$;

create function public.send_back_paper_score(p_round bigint, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.paper_confirmable(p_round);
  if coalesce(trim(p_note), '') = '' then raise exception 'Add a short note saying what isn''t right.' using errcode = 'P0001'; end if;
  if char_length(trim(p_note)) > 200 then raise exception 'Keep the note under 200 characters.' using errcode = 'P0001'; end if;
  perform set_config('teemate.paper', 'on', true);
  update public.rounds set paper_state = 'sent_back', paper_note = trim(p_note) where id = p_round;
  perform set_config('teemate.paper', '', true);
end $$;

create function public.resend_paper_score(p_round bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.rounds;
begin
  select * into r from public.rounds where id = p_round for update;
  if not found or r.paper_by is distinct from public.current_member_id() then
    raise exception 'Only the player who uploaded the card can send it again.' using errcode = '42501';
  end if;
  if r.paper_state is distinct from 'sent_back' then raise exception 'This score isn''t waiting to be fixed.' using errcode = 'P0001'; end if;
  perform set_config('teemate.paper', 'on', true);
  update public.rounds set paper_state = 'waiting' where id = p_round;
  perform set_config('teemate.paper', '', true);
end $$;

-- The scores waiting for me to confirm, and (for the club office) those left for the office.
create function public.my_paper_confirms() returns jsonb
language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'date', r.date, 'paperBy', r.paper_by, 'paperPhotos', r.paper_photos,
           'confirmer', r.paper_confirmer, 'lineup', r.lineup, 'scores', r.scores, 'game', r.game) order by r.date, r.id), '[]')
    from public.rounds r
   where r.paper_state = 'waiting'
     and (r.paper_confirmer = public.current_member_id() or (r.paper_confirmer is null and public.is_admin()))
$$;

do $$ declare f text; begin
  foreach f in array array['mark_paper_card(bigint, int, bigint)', 'confirm_paper_score(bigint)', 'send_back_paper_score(bigint, text)',
                           'resend_paper_score(bigint)', 'my_paper_confirms()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- The daily limit on reads (the read-scorecard function calls take_paper_read as the member first).
create table public.paper_reads (
  member_id bigint not null references public.members on delete cascade,
  day date not null,
  n int not null default 0,
  primary key (member_id, day)
);
alter table public.paper_reads enable row level security; -- no policies: only take_paper_read touches it

create function public.take_paper_read() returns void
language plpgsql security definer set search_path = '' as $$
declare v_me bigint := public.current_member_id(); v_n int;
begin
  if v_me is null then raise exception 'Only members can read scorecards.' using errcode = '42501'; end if;
  if not (select paper_cards from public.club_settings where id = 1) then
    raise exception 'Paper scorecards are switched off at this club.' using errcode = 'P0001';
  end if;
  insert into public.paper_reads (member_id, day, n) values (v_me, public.club_today(), 0) on conflict do nothing;
  select n into v_n from public.paper_reads where member_id = v_me and day = public.club_today() for update;
  if v_n >= 10 then
    raise exception 'You''ve read 10 cards today. Enter the scores by hand, or try again tomorrow.' using errcode = 'P0001';
  end if;
  update public.paper_reads set n = n + 1 where member_id = v_me and day = public.club_today();
end $$;
revoke execute on function public.take_paper_read() from public, anon;
grant execute on function public.take_paper_read() to authenticated;

-- Photos of the cropped score grid: <round id>/<card n>.jpg, for the players on that card and the club office.
insert into storage.buckets (id, name, public) values ('scorecards', 'scorecards', false) on conflict (id) do nothing;

create function public.can_see_card_photo(p_name text) returns boolean
language sql stable security definer set search_path to '' as $$
  select public.is_admin() or exists (
    select 1 from public.rounds r
     where r.id::text = split_part(p_name, '/', 1)
       and r.lineup @> jsonb_build_array(jsonb_build_object('m', public.current_member_id())))
$$;
grant execute on function public.can_see_card_photo(text) to authenticated;

create policy "card photos: players on the card and the office read" on storage.objects for select to authenticated
  using (bucket_id = 'scorecards' and public.can_see_card_photo(name));
create policy "card photos: players on the card upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'scorecards' and public.can_see_card_photo(name));
create policy "card photos: players on the card replace" on storage.objects for update to authenticated
  using (bucket_id = 'scorecards' and public.can_see_card_photo(name));
create policy "card photos: players on the card remove" on storage.objects for delete to authenticated
  using (bucket_id = 'scorecards' and public.can_see_card_photo(name));
