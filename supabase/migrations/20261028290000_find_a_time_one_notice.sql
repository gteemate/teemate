-- Find a time: one "everyone can do" notice per player listing every agreed slot (slots: [{ day, part }]), not one
-- per slot. Each confirm works out the agreed slots again: a player who hasn't yet seen all of them gets one notice
-- listing the lot (replacing an unseen one that's out of date); a player who has seen them all gets none. The
-- notice's date is the last agreed day, so it shows until that day passes.

alter table public.booking_notices add column slots jsonb;

create or replace function public.confirm_match_times(p_match bigint, p_answers jsonb, p_partner jsonb default null, p_note text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_me bigint := public.current_member_id(); m public.ko_matches; v_players bigint[]; v_partner bigint; v_note text; k text; v jsonb;
  t public.match_times; v_who bigint; v_set jsonb; v_agreed bigint; v_slots jsonb; v_seen jsonb; p bigint;
begin
  m := public.ko_match_to_arrange(p_match);
  v_players := public.ko_match_players(m.id);
  -- my partner: the other player in my own entry (pairs)
  select case when e.member_id = v_me then e.partner_id else e.member_id end into v_partner
    from public.signup_entries e where e.id in (m.a_entry, m.b_entry) and (e.member_id = v_me or e.partner_id = v_me);
  if p_partner is not null and jsonb_typeof(p_partner) = 'object' and p_partner <> '{}'::jsonb and v_partner is null then
    raise exception 'Only your own partner can be answered for.' using errcode = 'P0001';
  end if;
  v_note := nullif(trim(coalesce(p_note, '')), '');
  if char_length(v_note) > 120 then raise exception 'Keep the note to 120 characters.' using errcode = 'P0001'; end if;
  for v_who, v_set in select * from (values (v_me, coalesce(p_answers, '{}'::jsonb)), (v_partner, coalesce(p_partner, '{}'::jsonb))) x(w, s) where w is not null loop
    for k, v in select * from jsonb_each(v_set) loop
      select * into t from public.match_times where id = k::bigint and ko_match_id = m.id;
      if not found or t.day < public.club_today() then raise exception 'That day is no longer suggested.' using errcode = 'P0001'; end if;
      if jsonb_typeof(v) = 'null' then delete from public.match_time_answers where time_id = t.id and member_id = v_who;
      else insert into public.match_time_answers (time_id, member_id, can, answered_by) values (t.id, v_who, (v)::text::boolean, v_me)
             on conflict (time_id, member_id) do update set can = excluded.can, answered_by = excluded.answered_by;
      end if;
    end loop;
  end loop;
  if p_note is not null then
    if v_note is null then delete from public.match_time_notes where ko_match_id = m.id and member_id = v_me;
    else insert into public.match_time_notes (ko_match_id, member_id, note) values (m.id, v_me, v_note)
           on conflict (ko_match_id, member_id) do update set note = excluded.note, updated_at = now();
    end if;
  end if;
  -- After everything is saved: the agreed slots, in order.
  select coalesce(jsonb_agg(jsonb_build_object('day', x.day, 'part', x.part) order by x.day, array_position(array['morning', 'afternoon', 'evening'], x.part)), '[]'),
         (array_agg(x.id order by x.day, array_position(array['morning', 'afternoon', 'evening'], x.part)))[1]
    into v_slots, v_agreed
    from public.match_times x where x.ko_match_id = m.id and x.day >= public.club_today()
     and (select count(*) from public.match_time_answers a where a.time_id = x.id and a.can and a.member_id = any(v_players)) = cardinality(v_players);
  foreach p in array v_players loop
    -- the slots this player has already seen a notice for (older notices carry one slot in date / part)
    select coalesce(jsonb_agg(s), '[]') into v_seen from public.booking_notices nb,
           lateral jsonb_array_elements(coalesce(nb.slots, jsonb_build_array(jsonb_build_object('day', nb.date, 'part', nb.part)))) s
     where nb.kind = 'agreed' and nb.ko_match_id = m.id and nb.member_id = p and nb.seen;
    if exists (select 1 from jsonb_array_elements(v_slots) s where not v_seen @> jsonb_build_array(s)) then
      -- something new to tell: one notice with every agreed slot, unless an unseen one says exactly that already
      if not exists (select 1 from public.booking_notices where kind = 'agreed' and ko_match_id = m.id and member_id = p and not seen and slots = v_slots) then
        delete from public.booking_notices where kind = 'agreed' and ko_match_id = m.id and member_id = p and not seen;
        insert into public.booking_notices (member_id, kind, date, old_time, note, part, ko_match_id, slots)
          values (p, 'agreed', (v_slots->-1->>'day')::date, 0, (select name from public.signup_comps where id = m.comp_id), v_slots->0->>'part', m.id, v_slots);
      end if;
    else
      delete from public.booking_notices where kind = 'agreed' and ko_match_id = m.id and member_id = p and not seen;
    end if;
  end loop;
  return jsonb_build_object('agreed', v_agreed);
end $$;
