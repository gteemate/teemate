-- Everyone in a knockout (for the names on the bracket): players in the competition once the draw is published, and
-- admins always. Members otherwise see only their own entries.
create function public.ko_entries(p_comp bigint) returns jsonb
language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'memberId', e.member_id, 'partnerId', e.partner_id)), '[]')
    from public.signup_entries e
   where e.comp_id = p_comp
     and (public.is_admin() or ((select draw_published from public.signup_comps where id = p_comp) and public.my_ko_entry(p_comp) is not null))
$$;
revoke execute on function public.ko_entries(bigint) from public, anon;
grant execute on function public.ko_entries(bigint) to authenticated;
