-- Find a time, continued: the grid says which match it is (competition, round, play-by date), so it opens straight from
-- a notice; and my_ko_due() lists my knockout matches due within a week with nothing agreed and nothing booked (for
-- the reminder in the app).

create or replace function public.get_match_times(p_match bigint) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare v_players bigint[] := public.ko_match_players(p_match);
begin
  if v_players is null or not (public.current_member_id() = any(v_players) or public.is_admin()) then
    raise exception 'Only the players in this match can arrange it.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'match', (select jsonb_build_object('id', m.id, 'compId', c.id, 'compName', c.name, 'kind', c.kind, 'club', c.created_by is null, 'round', m.round,
                'by', coalesce(c.round_deadlines[m.round], public.club_today() + 21), 'status', m.status)
                from public.ko_matches m join public.signup_comps c on c.id = m.comp_id where m.id = p_match),
    'players', coalesce((select jsonb_agg(jsonb_build_object('id', x, 'name', mb.name) order by o) from unnest(v_players) with ordinality u(x, o) join public.members mb on mb.id = x), '[]'),
    'times', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'day', t.day, 'part', t.part, 'by', t.suggested_by,
               'answers', coalesce((select jsonb_object_agg(a.member_id::text, a.can) from public.match_time_answers a where a.time_id = t.id and a.member_id = any(v_players)), '{}'))
             order by t.day, array_position(array['morning', 'afternoon', 'evening'], t.part))
             from public.match_times t where t.ko_match_id = p_match and t.day >= public.club_today()), '[]'),
    'agreed', (select t.id from public.match_times t where t.ko_match_id = p_match and t.day >= public.club_today()
                 and (select count(*) from public.match_time_answers a where a.time_id = t.id and a.can and a.member_id = any(v_players)) = cardinality(v_players)
               order by t.day, array_position(array['morning', 'afternoon', 'evening'], t.part) limit 1));
end $$;

create function public.my_ko_due() returns jsonb
language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('matchId', m.id, 'compId', c.id, 'compName', c.name, 'round', m.round, 'by', c.round_deadlines[m.round]) order by c.round_deadlines[m.round]), '[]')
    from public.ko_matches m join public.signup_comps c on c.id = m.comp_id
   where c.draw_published and m.status in ('open', 'disputed') and m.a_entry is not null and m.b_entry is not null
     and public.current_member_id() = any(public.ko_match_players(m.id))
     and c.round_deadlines[m.round] between public.club_today() and public.club_today() + 7
     -- nothing agreed (everyone able to do a day still to come)
     and not exists (select 1 from public.match_times t where t.ko_match_id = m.id and t.day >= public.club_today()
                       and (select count(*) from public.match_time_answers a where a.time_id = t.id and a.can and a.member_id = any(public.ko_match_players(m.id))) = cardinality(public.ko_match_players(m.id)))
     -- and not booked (all of them on one booking before the play-by date)
     and not exists (select 1 from public.bookings b join public.tee_slots s on s.id = b.slot_id
                      where s.date between public.club_today() and c.round_deadlines[m.round]
                        and (select count(*) from public.booking_players bp where bp.booking_id = b.id and bp.member_id = any(public.ko_match_players(m.id))) = cardinality(public.ko_match_players(m.id)))
$$;
revoke execute on function public.my_ko_due() from public, anon;
grant execute on function public.my_ko_due() to authenticated;
