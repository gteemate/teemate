-- Who typed each score on a shared card: entered[hole][player] = member id, or null while it's still
-- the default par. A player's own score beats one typed for them, which beats an untouched default.
alter table public.rounds add column entered jsonb;
