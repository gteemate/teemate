-- Members can see who the hut staff are (like who's an admin), so the app shows the Hut screen to them.
grant select (hut_staff) on public.members to authenticated;
