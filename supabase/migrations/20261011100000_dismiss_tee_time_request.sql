-- A member can remove an answered tee time request (approved, declined or cancelled) from their own list.
-- The request stays for admins; only the member's list hides it.

alter table public.tee_time_requests add column dismissed boolean not null default false;

create function public.dismiss_tee_time_request(p_id bigint) returns void
language plpgsql security definer set search_path to '' as $$
declare v_status text;
begin
  select status into v_status from public.tee_time_requests where id = p_id and member_id = public.current_member_id();
  if not found then raise exception 'That request isn''t yours.' using errcode = '42501'; end if;
  if v_status = 'pending' then raise exception 'It''s still waiting for an admin: cancel it instead.' using errcode = 'P0001'; end if;
  update public.tee_time_requests set dismissed = true where id = p_id;
end $$;
revoke execute on function public.dismiss_tee_time_request(bigint) from public, anon;
grant execute on function public.dismiss_tee_time_request(bigint) to authenticated;
