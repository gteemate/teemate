-- Trigger functions are never called directly. Supabase's default grants gave signed-in
-- users EXECUTE on them; take it away (the triggers themselves still run).
revoke execute on function public.link_member_to_user(), public.check_guest_balance() from public, anon, authenticated;
