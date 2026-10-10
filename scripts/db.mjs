// Runs SQL against the Supabase project through the Management API.
//
//   node scripts/db.mjs migrate        apply supabase/migrations/*.sql not yet applied (recorded in ops.migrations)
//   node scripts/db.mjs seed           load supabase/seed.sql (wipes and reloads sample data)
//   node scripts/db.mjs test           run supabase/tests/*.sql (each rolls back) and print results
//   node scripts/db.mjs sql "<sql>"    run one statement and print the rows
//   add --live to use the live database (migrate, test and sql only); without it, the test database
//
// Needs SUPABASE_ACCESS_TOKEN and VITE_SUPABASE_URL in .env (live) and .env.test (test; see .env.example).
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname

// Which database: the TEST one (teemate-test, settings in .env.test) unless --live is given. Seeding, scenarios and
// the race test wipe or add data, so they only ever run against the test database.
const LIVE = process.argv.includes('--live')
const readEnv = f => (existsSync(join(root, f)) ? Object.fromEntries(readFileSync(join(root, f), 'utf8').split('\n')
  .map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()])) : {})
const base = readEnv('.env'), testEnv = readEnv('.env.test')
const refOf = url => url?.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
const liveRef = refOf(base.VITE_SUPABASE_URL)
if (!LIVE && !refOf(testEnv.VITE_SUPABASE_URL)) {
  console.error('No test database set up: add VITE_SUPABASE_URL and SUPABASE_ACCESS_TOKEN to .env.test (or pass --live for the live one).')
  process.exit(1)
}
const env = LIVE ? base : { ...base, ...testEnv }
const token = env.SUPABASE_ACCESS_TOKEN
const ref = refOf(env.VITE_SUPABASE_URL)
if (!token || !ref) {
  console.error(`Set SUPABASE_ACCESS_TOKEN and VITE_SUPABASE_URL in ${LIVE ? '.env' : '.env.test'}`)
  process.exit(1)
}
if (!LIVE && ref === liveRef) {
  console.error('.env.test points at the LIVE database. Refusing: the test settings must be a different project.')
  process.exit(1)
}
export const target = LIVE ? 'live' : 'test'
const TEST_ONLY = new Set(['seed', 'race', 'scenarios'])

// The Management API throttles bursts (429); wait and retry rather than fail half-way (e.g. mid clean-up).
export async function query(sql, tries = 6) {
  for (let i = 1; ; i++) {
    const res = await send(sql)
    if (res.status !== 429 || i === tries) return read(res)
    await new Promise(r => setTimeout(r, 2000 * i))
  }
}
const read = async res => {
  const body = await res.text()
  if (!res.ok) throw new Error(`${res.status}: ${body}`)
  return JSON.parse(body)
}
const send = sql => fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })

const sqlFiles = dir => (existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.sql')).sort() : [])

async function migrate() {
  await query('create schema if not exists ops; create table if not exists ops.migrations (name text primary key, applied_at timestamptz not null default now());')
  const done = new Set((await query('select name from ops.migrations')).map(r => r.name))
  const dir = join(root, 'supabase/migrations')
  const todo = sqlFiles(dir).filter(f => !done.has(f))
  if (!todo.length) return console.log('Database is up to date.')
  for (const f of todo) {
    process.stdout.write(`Applying ${f} … `)
    // One request = one transaction, so a failing migration leaves nothing behind.
    await query(`${readFileSync(join(dir, f), 'utf8')}\ninsert into ops.migrations (name) values ('${f.replace(/'/g, "''")}');`)
    console.log('done')
  }
}

async function seed() {
  process.stdout.write('Loading supabase/seed.sql … ')
  await query(readFileSync(join(root, 'supabase/seed.sql'), 'utf8'))
  console.log('done')
}

// Every situation the app handles, on top of the sample club (test database only).
async function scenarios() {
  await seed()
  process.stdout.write('Loading supabase/scenarios.sql … ')
  const r = await query(readFileSync(join(root, 'supabase/scenarios.sql'), 'utf8'))
  console.log('done')
  console.log(r.at?.(-1) ?? r)
}

async function test() {
  const dir = join(root, 'supabase/tests')
  let failed = 0
  for (const f of sqlFiles(dir)) {
    console.log(`\n${f}`)
    // A file that errors part-way still counts as failed, and the remaining files still run.
    const rows = await query(readFileSync(join(dir, f), 'utf8'))
      .catch(e => [{ ok: false, test: 'File stopped with an error', detail: e.message.replace(/\\n/g, ' ').slice(0, 300) }])
    for (const r of rows) {
      console.log(`  ${r.ok ? '✓' : '✗'} ${r.test}${r.ok ? '' : `  →  ${r.detail}`}`)
      if (!r.ok) failed++
    }
  }
  console.log(failed ? `\n${failed} failed` : '\nAll database tests passed')
  process.exit(failed ? 1 : 0)
}

// Real concurrency: many simultaneous requests (separate connections) racing for the same
// spaces and the same guest points. Uses tee times 1–7 days ahead, which are already released. Creates temporary logins and tee times, then removes them.
// Everything race() creates, so a run that died part-way is cleared by the next one.
const raceSlots = (t = '') => `(${t}date = current_date + 7 and (${t}start_time between 1 and 13 or ${t}start_time between 300 and 350 or ${t}start_time between 400 and 450))
  or (${t}date between current_date + 1 and current_date + 7 and ${t}start_time = 30)`
const raceCleanUp = () => query(`
  delete from public.guest_visits where booking_player_id in (select bp.id from public.booking_players bp join public.tee_slots s on s.id = bp.slot_id where ${raceSlots('s.')});
  delete from public.tee_slots where ${raceSlots()};
  delete from auth.users where email like 'race-%@example.invalid';`)

async function race() {
  await raceCleanUp()
  const tag = `race-${Date.now()}`
  const ids = await query(`
    insert into auth.users (id, email, aud, role)
      select gen_random_uuid(), '${tag}-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 8) i;
    update public.members m set user_id = u.id from auth.users u
     where u.email = '${tag}-' || m.id || '@example.invalid' and m.user_id is null;
    insert into public.tee_slots (course_id, date, start_time) select 1, current_date + 7, i from generate_series(1, 13) i
      on conflict do nothing;
    insert into public.tee_slots (course_id, date, start_time) select 1, current_date + 7, 300 + 10 * i from generate_series(0, 5) i
      on conflict do nothing;
    insert into public.tee_slots (course_id, date, start_time) select 1, current_date + i, 30 from generate_series(1, 7) i
      on conflict do nothing;
    insert into public.tee_slots (course_id, date, start_time) select 1, current_date + 7, 400 + 10 * i from generate_series(0, 5) i
      on conflict do nothing;
    select (select json_agg(json_build_object('m', m.id, 'uid', m.user_id) order by m.id) from public.members m
             join auth.users u on u.id = m.user_id where u.email like '${tag}-%') as users,
           (select json_agg(id order by start_time) from public.tee_slots where date = current_date + 7 and start_time between 1 and 13) as slots,
           (select json_agg(id order by start_time) from public.tee_slots where date = current_date + 7 and start_time between 300 and 350) as close,
           (select json_agg(id order by date) from public.tee_slots where date between current_date + 1 and current_date + 7 and start_time = 30) as days,
           (select json_agg(id order by start_time) from public.tee_slots where date = current_date + 7 and start_time between 400 and 450) as mine;`)
  const { users, slots, close, days, mine } = ids[0]
  const as = (uid, call) => query(`begin;
    select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true);
    set local role authenticated;
    select ${call} as r;
    commit;`).then(() => 'booked', e => (e.message.match(/ERROR:\s+\w+:\s+(.*?)(?:\\n|\n|$)/)?.[1] ?? e.message))
  const tally = rs => Object.entries(rs.reduce((t, r) => ({ ...t, [r]: (t[r] || 0) + 1 }), {})).map(([k, v]) => `${v} × ${k}`).join('\n    ')

  try {
    console.log(`\n1. ${users.length} members book the same empty tee time at the same moment (4 spaces)`)
    const r1 = await Promise.all(users.map(u => as(u.uid, `public.book_tee_time(${slots[0]})`)))
    const [{ n }] = await query(`select count(*)::int as n from public.booking_players where slot_id = ${slots[0]}`)
    console.log(`    ${tally(r1)}\n    ${n === 4 ? '✓' : '✗'} players on the tee time: ${n} (must be 4)`)

    const declan = users.find(u => u.m === 1)
    const [{ before }] = await query(`select coalesce(sum(points), 0)::int as before from public.guest_visits where member_id = 1 and date_trunc('year', date) = date_trunc('year', current_date + 7)`)
    console.log(`\n2. Declan has ${36 - before} guest points; 7 two-guest bookings (6 pts each) on 7 different days, all at once`)
    const r2 = await Promise.all(days.map(s => as(declan.uid, `public.book_tee_time(${s}, '{}', '[{"name":"Race Guest"},{"name":"Race Guest"}]')`)))
    const [{ used }] = await query(`select sum(points)::int as used from public.guest_visits where member_id = 1 and date_trunc('year', date) = date_trunc('year', current_date + 7)`)
    const pointsOk = used <= 36 && 36 - used < 6 // never over the allowance, and nothing left that another two-guest booking could have used
    console.log(`    ${tally(r2)}\n    ${pointsOk ? '✓' : '✗'} points used this year: ${used} of 36 (must not exceed 36)`)

    // Six people each book the same member onto a different tee time, 10 minutes apart, at the same moment.
    // The 2-hour rule must let only one through, even when they all check at once.
    const target = users[users.length - 1], bookers = users.slice(1, 7)
    console.log(`\n3. Six members each book member ${target.m} onto a different tee time 10 minutes apart, at the same moment`)
    const r3 = await Promise.all(bookers.map((u, i) => as(u.uid, `public.book_tee_time(${close[i]}, '{${target.m}}')`)))
    const [{ times }] = await query(`select count(*)::int as times from public.booking_players where member_id = ${target.m} and slot_id in (${close.join(',')})`)
    console.log(`    ${tally(r3)}\n    ${times <= 1 ? '✓' : '✗'} member ${target.m} is on ${times} of the six tee times (must be at most 1)`)

    // One member books themselves and a guest onto six tee times 10 minutes apart, all at once (two phones,
    // double taps). With a guest the booking waits on a lock after the 2-hour check, which opens the window.
    const me = users[2]
    console.log(`\n4. Member ${me.m} books themselves and a guest onto six tee times 10 minutes apart, all at once`)
    const r4 = await Promise.all(mine.map(s => as(me.uid, `public.book_tee_time(${s}, '{}', '[{"name":"Race Guest"}]')`)))
    const [{ own }] = await query(`select count(*)::int as own from public.booking_players where member_id = ${me.m} and slot_id in (${mine.join(',')})`)
    console.log(`    ${tally(r4)}\n    ${own <= 1 ? '✓' : '✗'} member ${me.m} is on ${own} of the six tee times (must be at most 1)`)
    return n === 4 && pointsOk && times <= 1 && own <= 1
  } finally {
    await raceCleanUp()
    console.log('\n    Cleaned up test logins, tee times, bookings and points.')
  }
}

const [cmd, arg] = process.argv.slice(2).filter(a => a !== '--live')
const run = { migrate, seed, scenarios, test, race: async () => process.exit((await race()) ? 0 : 1), sql: async () => console.log(JSON.stringify(await query(arg), null, 2)) }[cmd]
if (!run) {
  console.error('Usage: node scripts/db.mjs migrate | seed | scenarios | test | race | sql "<sql>"  [--live]')
  process.exit(1)
}
if (LIVE && TEST_ONLY.has(cmd)) {
  console.error(`"${cmd}" only runs against the test database: it changes or wipes data. Refusing to run it on live.`)
  process.exit(1)
}
console.error(LIVE ? '→ LIVE database' : '→ test database (teemate-test)')
run().catch(e => { console.error(e.message); process.exit(1) })
