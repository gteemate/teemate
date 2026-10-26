-- Demo sign-ins, one per kind of end user, all with the password: password
-- Loaded by `npm run db:demo` (test) or `npm run db:demo:live`. Safe to run again: it puts every demo login back
-- to where it starts (logins remade, the new joiner back to "approved, no password yet").
--   winter.league@test.com   a Winter League player on Team 1 (an existing member with no login)
--   captain@test.com         Team 1's Winter League captain
--   clean@test.com           a brand-new member: nothing booked, entered or played
--   admin@test.com           the club office: the back-office login that runs the club and doesn't play
--   hut@test.com             halfway hut staff: sees orders and marks them ready
--   newjoiner@test.com       approved but no login yet: taps "create your password" on the sign-in screen

-- ---------------------------------------------------------------- start clean
delete from auth.users where email like '%@test.com';          -- members.user_id goes null with them
update public.members set email = null where email like '%@test.com' and name not in ('New Member', 'Club Office', 'Halfway Hut', 'New Joiner');

-- ---------------------------------------------------------------- existing members: the Winter League ones
with wl as (select team, league_teams from public.events where name = 'Winter League' and style = 'league' order by id limit 1),
team1 as (select key::bigint as id from wl, jsonb_each_text(wl.team) where value = '0'),
captain as (select coalesce((select (league_teams->0->>'captain')::bigint from wl),
                            (select min(t.id) from team1 t join public.members m on m.id = t.id where m.email is null)) as id)
update public.members m set email = 'captain@test.com' from captain c where m.id = c.id and m.email is null;

with wl as (select team from public.events where name = 'Winter League' and style = 'league' order by id limit 1)
update public.members set email = 'winter.league@test.com'
 where id = (select min(m.id) from wl, jsonb_each_text(wl.team) t join public.members m on m.id = t.key::bigint
              where t.value = '0' and m.email is null);

-- ---------------------------------------------------------------- new members (made once, kept after)
insert into public.members (id, name, hcp_index, admin, office, hut_staff, email, plays_in)
select (select max(id) from public.members) + row_number() over (), v.name, v.hcp, v.admin, v.admin, v.hut, v.email, v.plays_in
  from (values ('New Member', 18.0, false, false, 'clean@test.com', 'men'),
               ('Club Office', 54.0, true, false, 'admin@test.com', null),
               ('Halfway Hut', 54.0, false, true, 'hut@test.com', null),
               ('New Joiner', 24.0, false, false, 'newjoiner@test.com', 'ladies')) v(name, hcp, admin, hut, email, plays_in)
 where not exists (select 1 from public.members m where m.email = v.email);

update public.members set admin = true, office = true where email = 'admin@test.com';

-- ---------------------------------------------------------------- the logins (not the new joiner: they make their own)
with u as (
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', e, extensions.crypt('password', extensions.gen_salt('bf')), now(),
         '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
    from unnest(array['winter.league@test.com', 'captain@test.com', 'clean@test.com', 'admin@test.com', 'hut@test.com']) e
  returning id, email)
insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), 'email', now(), now(), now() from u;
update public.members m set user_id = u.id from auth.users u where lower(u.email) = m.email and m.user_id is null;

select m.email, m.name, m.admin, m.office, m.hut_staff, m.user_id is not null as has_login from public.members m where m.email like '%@test.com' order by m.email;
