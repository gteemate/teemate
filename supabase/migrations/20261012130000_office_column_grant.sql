-- Members' columns are shared one by one (emails stay private). The office column was never shared, so every
-- signed-in screen failed with "permission denied for table members".
grant select (office) on public.members to authenticated;
