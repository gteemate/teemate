-- Supabase grants new functions to anon by default; setting the club name is for signed-in admins only.
revoke execute on function public.admin_set_club_name(text) from anon;
