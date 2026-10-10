-- Balances are read-only to members (their own row) and invisible before sign-in: take away the default write and
-- visitor access a new table gets, so it doesn't rest on the row rules alone.
revoke all on public.member_balances from anon;
revoke insert, update, delete, truncate, references, trigger on public.member_balances from authenticated;
