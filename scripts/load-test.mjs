// The 8pm load test (TEST database only): a crowd of members with real sign-ins hitting the tee sheet as tee times
// for 8 days ahead open. Run: npm run load-test -- 300   (the number of members; default 100)
//
// What it does:
//  1. Resets the test database to the scenarios, adds N load-test members with logins, and sets the release a little
//     over a minute ahead (so there's a real countdown), and signs everyone in.
//  2. Before the release, everyone opens the tee sheet (refreshing), and the group bookers try to book a second early
//     (they should be told it isn't open yet).
//  3. At the release, each group's booker goes for a favourite time (mostly mornings) for their group of 1–4; if it's
//     taken, they refresh and try the next, up to 4 goes. Everyone else looks at the tee sheet.
//  4. Checks the database (no tee time over 4, nobody booked twice that day, every success really booked) and
//     reports speeds, failures and a verdict. Then removes the load-test members and puts the release back.
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { query, scenarios, target } from './db.mjs'
import { spawnSync } from 'node:child_process'

if (target !== 'test') { console.error('The load test only runs against the test database.'); process.exit(1) }
const N = Math.max(4, +(process.argv.find(a => /^\d+$/.test(a)) ?? 100))
const env = Object.fromEntries(readFileSync(new URL('../.env.test', import.meta.url), 'utf8').split('\n').map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]))
const URL_ = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_ANON_KEY
const BASE_ID = 100000, LEAD_SECONDS = 75, DAY = 8
const sleep = ms => new Promise(r => setTimeout(r, ms))
const log = (...a) => console.log(...a)

// ---------------------------------------------------------------- requests, timed
const calls = [] // { kind, at (ms after release), ms, ok, error }
let releaseAt = 0 // local clock ms of the release
async function api(kind, path, body, token) {
  const t0 = Date.now()
  let ok = false, error = null, data = null
  try {
    const res = await fetch(`${URL_}${path}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${token ?? KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) })
    const text = await res.text()
    data = text ? JSON.parse(text) : null
    ok = res.ok
    if (!ok) error = `${res.status} ${data?.message ?? data?.msg ?? data?.error_description ?? text.slice(0, 120)}`
  } catch (e) { error = e.name === 'TimeoutError' ? 'timeout (30s)' : `network: ${e.message}` }
  calls.push({ kind, at: t0 - releaseAt, ms: Date.now() - t0, ok, error })
  return { ok, data, error }
}
const sheet = token => api('sheet', '/rest/v1/rpc/get_tee_sheet', { p_date: isoIn(DAY) }, token)
const book = (token, slot, others) => api('book', '/rest/v1/rpc/book_tee_time', { p_slot_id: slot, p_member_ids: others, p_guests: [] }, token)
const isoIn = d => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10) }

// ---------------------------------------------------------------- set up
async function setup(password) {
  log(`Resetting the test database to the scenarios and adding ${N} load-test members…`)
  const made = spawnSync(process.execPath, [new URL('./make-seed.mjs', import.meta.url).pathname], { encoding: 'utf8' })
  if (made.status !== 0) throw new Error(made.stderr)
  await scenarios()
  const pw = password.replace(/'/g, "''")
  await query(`
    delete from auth.users where email like 'load-%@teemate.test';
    delete from public.members where id >= ${BASE_ID};
    insert into public.members (id, name, hcp_index, plays_in, email)
      select ${BASE_ID} + i, 'Load Member ' || i, round((random() * 30)::numeric, 1), 'men', 'load-' || i || '@teemate.test' from generate_series(1, ${N}) i;
    with h as (select extensions.crypt('${pw}', extensions.gen_salt('bf', 4)) as hash),
    u as (
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                              created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
      select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'load-' || i || '@teemate.test', h.hash, now(),
             '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
        from generate_series(1, ${N}) i, h
      returning id, email)
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
    select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), 'email', now(), now(), now() from u;
    update public.members m set user_id = u.id from auth.users u where u.email = m.email and m.id >= ${BASE_ID};
    -- the day's tee sheet exists before the rush (as it does for real: the app creates it when anyone looks)
    insert into public.tee_slots (course_id, date, start_time, twilight)
      select 1, current_date + ${DAY}, m, m >= 900 from generate_series(450, 990, 10) m where not (m >= 740 and m < 780) on conflict do nothing;`)
  const [{ linked }] = await query(`select count(*)::int as linked from public.members where id >= ${BASE_ID} and user_id is not null`)
  if (linked !== N) throw new Error(`Only ${linked} of ${N} load-test members got a login`)
}

// Signed in beforehand (members are already signed in at 8pm), paced: Supabase also limits bursts of sign-ins, so a
// "slow down" (429) waits and tries again.
async function signInAll(password) {
  log(`Signing in ${N} members (paced)…`)
  const tokens = new Array(N)
  let waits = 0
  for (let i = 0; i < N; i += 10) {
    await Promise.all(Array.from({ length: Math.min(10, N - i) }, async (_, k) => {
      const n = i + k + 1
      for (let attempt = 1; ; attempt++) {
        const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `load-${n}@teemate.test`, password }) })
        const d = await res.json()
        if (res.ok) { tokens[n - 1] = d.access_token; return }
        if (res.status !== 429 || attempt === 30) throw new Error(`Sign-in ${n} failed: ${res.status} ${d.msg ?? d.error_description ?? JSON.stringify(d)}`)
        waits++
        await sleep(2000)
      }
    }))
    await sleep(400)
    if ((i / 10) % 5 === 4) process.stdout.write(`  ${Math.min(N, i + 10)} signed in\n`)
  }
  if (waits) log(`  (Supabase asked us to slow down ${waits} times while signing in)`)
  return tokens
}

// Groups of 1–4 (mostly two- and four-balls); the first in each group books for all of them.
function groups() {
  const ids = Array.from({ length: N }, (_, i) => i), out = []
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]] }
  while (ids.length) {
    const r = Math.random(), size = Math.min(ids.length, r < 0.15 ? 1 : r < 0.5 ? 2 : r < 0.7 ? 3 : 4)
    out.push(ids.splice(0, size))
  }
  return out
}
// A favourite time: mostly 08:00–10:30, some later.
const favourite = () => { const r = Math.random(); return r < 0.75 ? 480 + Math.round(Math.random() * 150) : 630 + Math.round(Math.random() * 330) }
const room = s => s.capacity - s.players.length

// ---------------------------------------------------------------- the rush
async function run() {
  const password = `load-${randomBytes(9).toString('base64url')}`
  await setup(password)
  const tokens = await signInAll(password)
  const gs = groups()
  const memberId = i => BASE_ID + i + 1

  // The release: a little over a minute from now (on the database's clock, London time).
  const [{ db_ms }] = await query(`
    update public.club_settings set release_time = ((now() + interval '${LEAD_SECONDS} seconds') at time zone 'Europe/London')::time(0), release_days = ${DAY}, release_weekends_only = false where id = 1;
    select (extract(epoch from (((current_date + ${DAY} - ${DAY}) + (select release_time from public.club_settings where id = 1)) at time zone 'Europe/London')) * 1000)::bigint as db_ms;`)
  const [{ now_ms }] = await query(`select (extract(epoch from now()) * 1000)::bigint as now_ms`)
  const skew = Date.now() - +now_ms // local minus database clock
  releaseAt = +db_ms + skew
  log(`\n${N} members in ${gs.length} groups. Tee times for ${isoIn(DAY)} open in ${Math.round((releaseAt - Date.now()) / 1000)}s…`)

  const results = [] // per group: { size, booked, at (ms after release), tries, why }
  const untilRelease = ms => sleep(Math.max(0, releaseAt + ms - Date.now()))

  // Everyone looks at the tee sheet in the half-minute before (some twice).
  const early = Array.from({ length: N }, async (_, i) => {
    await untilRelease(-30000 + Math.random() * 25000)
    await sheet(tokens[i])
    if (Math.random() < 0.4) { await untilRelease(-3000 + Math.random() * 2500); await sheet(tokens[i]) }
  })
  // Bookers jump the gun by up to a second (they should be told it isn't open yet).
  const jumps = gs.map(async g => {
    await untilRelease(-1200 + Math.random() * 900)
    const s = await sheet(tokens[g[0]])
    const slot = s.data?.find(x => room(x) >= g.length)
    if (slot) {
      const sent = Date.now(), r = await book(tokens[g[0]], slot.id, g.slice(1).map(memberId))
      calls.at(-1).early = true
      // Sent before 8pm but, under load, reached the database just after: rightly booked (the server's clock decides).
      if (r.ok) { g.done = true; calls.at(-1).landedAfter = true; results.push({ size: g.length, booked: true, at: Date.now() - releaseAt, tries: 1, sentEarly: sent < releaseAt }) }
    }
  })
  await Promise.all([...early, ...jumps])

  // The release: bookers go for it; others watch.
  const rush = gs.filter(g => !g.done).map(async g => {
    await untilRelease(Math.random() * 1500) // most within the first second or two
    const want = favourite(), others = g.slice(1).map(memberId), t = tokens[g[0]]
    for (let tries = 1; tries <= 4; tries++) {
      const s = await sheet(t)
      if (!s.ok) { if (tries === 4) results.push({ size: g.length, booked: false, tries, why: `tee sheet failed: ${s.error}` }); continue }
      const options = s.data.filter(x => room(x) >= g.length).sort((a, b) => Math.abs(a.time - want) - Math.abs(b.time - want))
      if (!options.length) { results.push({ size: g.length, booked: false, tries, why: 'no time left with room for the group' }); return }
      const r = await book(t, options[0].id, others)
      if (r.ok) { results.push({ size: g.length, booked: true, at: Date.now() - releaseAt, tries, wanted: want, got: options[0].time }); return }
      if (!/taken|spaces|full/i.test(r.error ?? '')) { results.push({ size: g.length, booked: false, tries, why: r.error }); return }
    }
    results.push({ size: g.length, booked: false, tries: 4, why: 'taken four times running' })
  })
  const watchers = gs.flatMap(g => g.slice(1)).map(async i => { await untilRelease(Math.random() * 4000); await sheet(tokens[i]) })
  await Promise.all([...rush, ...watchers])

  // ---------------------------------------------------------------- check the database
  const [check] = await query(`
    with d as (select current_date + ${DAY} as day)
    select
      (select count(*)::int from public.tee_slots s, d where s.date = d.day and (select count(*) from public.booking_players bp where bp.slot_id = s.id) > s.capacity) as over_full,
      (select count(*)::int from (select bp.member_id from public.booking_players bp join public.tee_slots s on s.id = bp.slot_id, d where s.date = d.day and bp.member_id >= ${BASE_ID} group by bp.member_id having count(*) > 1) x) as booked_twice,
      (select count(*)::int from public.bookings b join public.tee_slots s on s.id = b.slot_id, d where s.date = d.day and b.booked_by >= ${BASE_ID}) as bookings,
      (select count(*)::int from public.booking_players bp join public.tee_slots s on s.id = bp.slot_id, d where s.date = d.day and bp.member_id >= ${BASE_ID}) as players_booked,
      (select count(*)::int from public.tee_slots s, d where s.date = d.day) as tee_times,
      (select sum(capacity)::int from public.tee_slots s, d where s.date = d.day) as spaces`)
  report(gs, results, check)
  await cleanUp()
}

// ---------------------------------------------------------------- report
const pct = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
const secs = ms => (ms == null ? '–' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`)
function report(gs, results, check) {
  const after = calls.filter(c => c.at >= 0 && !c.early), before = calls.filter(c => c.at < 0 || c.early)
  const kinds = k => after.filter(c => c.kind === k)
  const expected = e => /taken|spaces|full|not open|opens|open at|isn.t open/i.test(e ?? "")
  const real = calls.filter(c => !c.ok && !expected(c.error))
  const early = calls.filter(c => c.early && !c.landedAfter), landed = calls.filter(c => c.landedAfter)
  const booked = results.filter(r => r.booked), failed = results.filter(r => !r.booked)
  const groupBy = xs => Object.entries(xs.reduce((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1])
  log(`\n================ 8pm load test: ${N} members, ${gs.length} groups ================`)
  log(`Requests: ${calls.length} (${before.length} before the release, ${after.length} after)`)
  for (const [k, name] of [['sheet', 'Tee sheet loads'], ['book', 'Booking attempts']]) {
    const ms = kinds(k).map(c => c.ms)
    log(`${name} after the release: ${ms.length} · typical ${secs(pct(ms, 0.5))} · slowest 1 in 20 ${secs(pct(ms, 0.95))} · slowest ${secs(Math.max(0, ...ms))}`)
  }
  log(`Bookers who tried a second early: ${early.length + landed.length} · refused as not open yet: ${early.length}${early.every(c => !c.ok) ? ' ✓' : ' ✗'}${landed.length ? ` · ${landed.length} sent just before 8pm reached the database after it (rightly booked)` : ''}`)
  log(`\nGroups booked: ${booked.length} of ${gs.length} · time from 8pm to booked: typical ${secs(pct(booked.map(r => r.at), 0.5))}, slowest 1 in 20 ${secs(pct(booked.map(r => r.at), 0.95))}, slowest ${secs(Math.max(0, ...booked.map(r => r.at)))}`)
  log(`  first try: ${booked.filter(r => r.tries === 1).length} · second: ${booked.filter(r => r.tries === 2).length} · third or fourth: ${booked.filter(r => r.tries > 2).length}`)
  if (failed.length) { log(`Groups not booked: ${failed.length}`); for (const [why, n] of groupBy(failed.map(r => r.why))) log(`  ${n} × ${why}`) }
  log(`\nUnexpected errors (not "taken" or "not open yet"): ${real.length}`)
  for (const [e, n] of groupBy(real.map(c => `${c.kind}: ${c.error}`)).slice(0, 8)) log(`  ${n} × ${e}`)
  log(`\nDatabase checks: tee times over 4 players: ${check.over_full} ${check.over_full ? '✗' : '✓'} · members booked twice that day: ${check.booked_twice} ${check.booked_twice ? '✗' : '✓'} · bookings ${check.bookings} = groups booked ${booked.length} ${check.bookings === booked.length ? '✓' : '✗'}`)
  log(`Tee sheet that day: ${check.players_booked} of ${check.spaces} spaces taken across ${check.tee_times} tee times`)
  const ok = !real.length && !check.over_full && !check.booked_twice && check.bookings === booked.length && early.every(c => !c.ok)
  log(`\nVerdict: ${ok ? 'COPED ✓ no unexpected errors, every booking correct' : 'PROBLEMS ✗ see above'}`)
}

async function cleanUp() {
  await query(`
    delete from public.members where id >= ${BASE_ID};
    delete from auth.users where email like 'load-%@teemate.test';
    update public.club_settings set release_time = '20:00', release_days = 8 where id = 1;`)
  log('\nCleaned up: load-test members and logins removed, release back to 8pm.')
}

run().catch(async e => { console.error('\nLoad test stopped:', e.message); await cleanUp().catch(() => {}); process.exit(1) })
