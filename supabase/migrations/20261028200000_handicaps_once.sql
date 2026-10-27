-- Handicaps from a file: a member listed twice refuses the lot (which row is right isn't ours to guess).

create or replace function public.admin_set_handicaps(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if not public.is_admin() then raise exception 'Only the club office can update handicaps.' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'There are no handicaps to update.' using errcode = 'P0001'; end if;
  if (select count(distinct x->>'id') from jsonb_array_elements(p_rows) x) <> jsonb_array_length(p_rows) then
    raise exception 'A member is listed twice.' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(p_rows) x where (x->>'hcp') is null or (x->>'hcp')::numeric < -10 or (x->>'hcp')::numeric > 54) then
    raise exception 'Handicap index must be between +10 and 54.' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(p_rows) x where not exists (select 1 from public.members m where m.id = (x->>'id')::bigint)) then
    raise exception 'One of those isn''t a member any more.' using errcode = 'P0001';
  end if;
  update public.members m set hcp_index = round((x->>'hcp')::numeric, 1)
    from jsonb_array_elements(p_rows) x where m.id = (x->>'id')::bigint;
  get diagnostics v_n = row_count;
  return jsonb_build_object('updated', v_n);
end $$;
