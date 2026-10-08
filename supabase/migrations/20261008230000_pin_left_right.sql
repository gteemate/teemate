-- Pins measured both ways: yards from the front or back, and from the left or right edge.
-- Each green now has a width (estimated, admins can correct it) so players can see how much
-- green there is on every side of the pin.
--
-- pin_sheets.pins entries: { hole, yardsOn (from front), fromLeft, depthRef: 'front'|'back', sideRef: 'left'|'right' }
-- depthRef/sideRef remember which edge the admin measured from, so editing shows it the same way.

alter table public.holes add column green_width int, add column green_width_estimated boolean not null default true;
update public.holes set green_width = greatest(18, round(green_depth * 0.8));
alter table public.holes alter column green_width set not null,
  add constraint green_width_range check (green_width between 8 and 80);

-- Existing pins only had left/centre/right: place them a quarter, half or three-quarters across.
update public.pin_sheets ps set pins = (
  select jsonb_agg(p || jsonb_build_object(
           'fromLeft', round(h.green_width * case p->>'side' when 'L' then 0.25 when 'R' then 0.75 else 0.5 end),
           'depthRef', 'front', 'sideRef', case p->>'side' when 'R' then 'right' else 'left' end) - 'side'
         order by (p->>'hole')::int)
  from jsonb_array_elements(ps.pins) p join public.holes h on h.course_id = ps.course_id and h.n = (p->>'hole')::int);

-- Admins correct a green's width.
create function public.admin_set_green_width(p_hole int, p_width int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change green sizes.' using errcode = '42501';
  end if;
  if p_width is null or p_width < 8 or p_width > 80 then
    raise exception 'Green width must be between 8 and 80 yards.' using errcode = 'P0001';
  end if;
  update public.holes set green_width = p_width, green_width_estimated = false
   where n = p_hole and course_id = (select id from public.courses order by id limit 1);
end $$;
revoke execute on function public.admin_set_green_width(int, int) from public, anon;
grant execute on function public.admin_set_green_width(int, int) to authenticated;
