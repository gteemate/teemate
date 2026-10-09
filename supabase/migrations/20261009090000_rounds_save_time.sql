-- Shared cards: the database stamps every save, so a phone can say "write this only if the card
-- hasn't changed since I read it" (compare updated_at) without trusting phone clocks.
-- clock_timestamp() rather than now(), so two saves in one transaction still differ.

create function public.rounds_stamp_save() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

create trigger rounds_stamp_save before insert or update on public.rounds
for each row execute function public.rounds_stamp_save();

revoke execute on function public.rounds_stamp_save() from public;
