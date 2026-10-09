-- Database tests: the database stamps every card save (shared cards compare it). Rolled back.
begin;
create schema t;
create table t.results (n serial, test text, ok boolean, detail text);
create function t.ok(p_test text, p_ok boolean, p_detail text default null) returns void language sql as $$
  insert into t.results (test, ok, detail) values (p_test, coalesce(p_ok, false), p_detail) $$;

do $$ declare r bigint; a timestamptz; b timestamptz; begin
  insert into public.rounds (created_by, lineup, scores, done, updated_at)
    values ((select min(id) from public.members), jsonb_build_array(jsonb_build_object('m', (select min(id) from public.members))), '[]', '[]', '2000-01-01') returning id, updated_at into r, a;
  perform t.ok('Save time: a new card gets the database''s time, not the phone''s', a > '2020-01-01', a::text);
  update public.rounds set scores = '[[4]]', updated_at = '2000-01-01' where id = r returning updated_at into b;
  perform t.ok('Save time: a save gets a new time even if the phone sends an old one', b > a, b::text);
  update public.rounds set scores = '[[5]]' where id = r returning updated_at into a;
  perform t.ok('Save time: two saves in one transaction still get different times', a > b, a::text);
end $$;

select test, ok, detail from t.results order by n;
rollback;
