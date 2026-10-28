-- Find a time's conversation keeps only each player's last 2 messages in a match: a new one replaces their oldest.
create function public.keep_last_two_match_notes() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  delete from public.match_time_notes n where n.ko_match_id = new.ko_match_id and n.member_id = new.member_id
    and n.id not in (select id from public.match_time_notes where ko_match_id = new.ko_match_id and member_id = new.member_id order by id desc limit 2);
  return null;
end $$;
revoke execute on function public.keep_last_two_match_notes() from public, anon, authenticated;
create trigger keep_last_two after insert on public.match_time_notes for each row execute function public.keep_last_two_match_notes();
