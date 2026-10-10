-- Knockout fixtures and scorecards: a player starts the card for their match from the draw ("Score this match"),
-- which links it to the fixture. Everyone who can see the draw can open the card; when the match is decided on the
-- card, the app offers the result to send (the usual report / confirm still applies). Matches played without the
-- app keep typed-in results.

alter table public.ko_matches add column round_id bigint references public.rounds on delete set null;

-- Link a card to my match (I'm on the card and in the match, and it has no result yet). A new card replaces an old link.
create function public.ko_link_card(p_match bigint, p_round bigint) returns void
language plpgsql security definer set search_path to '' as $$
declare m public.ko_matches; v_mine bigint;
begin
  select * into m from public.ko_matches where id = p_match for update;
  if not found then raise exception 'That match no longer exists.' using errcode = 'P0001'; end if;
  v_mine := public.my_ko_entry(m.comp_id);
  if v_mine is null or v_mine not in (m.a_entry, m.b_entry) then raise exception 'You can only score your own match.' using errcode = '42501'; end if;
  if m.status <> 'open' then raise exception 'That match already has a result.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.rounds r where r.id = p_round and r.lineup @> jsonb_build_array(jsonb_build_object('m', public.current_member_id()))) then
    raise exception 'That scorecard isn''t yours.' using errcode = 'P0001';
  end if;
  update public.ko_matches set round_id = p_round, updated_at = now() where id = m.id;
end $$;
revoke execute on function public.ko_link_card(bigint, bigint) from public, anon;
grant execute on function public.ko_link_card(bigint, bigint) to authenticated;
