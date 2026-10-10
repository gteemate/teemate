-- Enter a club competition on the day, from the card you're starting ("Saturday Medal is on today: play in it?").
-- In one step: you're added to its players and this card counts for you, with your marker. Only for competitions
-- open for entry (self_entry), on today, without a draw (a draw needs its players in advance).

create function public.enter_event_today(p_round bigint, p_event bigint, p_marker jsonb) returns integer
language plpgsql security definer set search_path to '' as $$
declare v_me bigint := public.current_member_id(); e public.events;
begin
  if v_me is null then raise exception 'Only members can enter competitions.' using errcode = '42501'; end if;
  if p_marker is null then raise exception 'Pick who''s marking your card first.' using errcode = 'P0001'; end if;
  select * into e from public.events where id = p_event for update;
  if not found or not e.club or not e.self_entry then raise exception 'This competition isn''t open for entry. Ask an admin to add you.' using errcode = 'P0001'; end if;
  if current_date < e.start_date or current_date > e.start_date + e.days - 1 then raise exception 'This competition isn''t on today.' using errcode = 'P0001'; end if;
  if exists (select 1 from jsonb_each(coalesce(e.matches, '{}')) d where jsonb_array_length(d.value) > 0) then
    raise exception 'This competition has a draw, so an admin adds its players.' using errcode = 'P0001';
  end if;
  if not v_me = any (e.players) then update public.events set players = players || v_me where id = e.id; end if;
  return public.enter_event_round(p_round, p_event, array[v_me], p_marker); -- refusals there undo the entry too
end $$;
revoke execute on function public.enter_event_today(bigint, bigint, jsonb) from public, anon;
grant execute on function public.enter_event_today(bigint, bigint, jsonb) to authenticated;
