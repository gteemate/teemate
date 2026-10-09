-- One card per group: a card started from a tee time is only created if today's card for that tee time
-- (one I'm on, not finished) doesn't exist yet; otherwise you get that one. A lock per tee time means two
-- phones starting at the same moment can't both create one. Runs as the caller, so the usual
-- rounds policies apply (created_by is set by its default).

create function public.start_tee_time_card(p_card jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_slot bigint := (p_card->>'slot_id')::bigint;
  v_id bigint;
  v_at timestamptz;
begin
  if v_slot is null then
    raise exception 'A tee time is needed to start this card.' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('start_tee_time_card'), v_slot::int);
  select r.id, r.updated_at into v_id, v_at from public.rounds r
   where r.slot_id = v_slot and r.date = current_date and public.on_card(r.lineup)
     and not coalesce((r.submitted ->> r.game)::boolean, false)
   order by r.id desc limit 1;
  if v_id is not null then
    return jsonb_build_object('id', v_id, 'updated_at', v_at, 'joined', true);
  end if;
  insert into public.rounds (lineup, slot_id, game, pairing, scores, entered, done, submitted)
  values (p_card->'lineup', v_slot, p_card->>'game', coalesce((p_card->>'pairing')::int, 0), p_card->'scores',
          nullif(p_card->'entered', 'null'::jsonb), p_card->'done', coalesce(p_card->'submitted', '{}'))
  returning id, updated_at into v_id, v_at;
  return jsonb_build_object('id', v_id, 'updated_at', v_at, 'joined', false);
end $$;

revoke execute on function public.start_tee_time_card(jsonb) from public, anon;
grant execute on function public.start_tee_time_card(jsonb) to authenticated;
