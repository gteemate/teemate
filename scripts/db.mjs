// Runs SQL against the Supabase project through the Management API.
//
//   node scripts/db.mjs migrate        apply supabase/migrations/*.sql not yet applied (recorded in ops.migrations)
//   node scripts/db.mjs seed           load supabase/seed.sql (wipes and reloads sample data)
//   node scripts/db.mjs test           run supabase/tests/*.sql (each rolls back) and print results
//   node scripts/db.mjs sql "<sql>"    run one statement and print the rows
//
// Needs SUPABASE_ACCESS_TOKEN and VITE_SUPABASE_URL in .env (see .env.example).
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
if (existsSync(join(root, '.env'))) {
  for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}
const token = process.env.SUPABASE_ACCESS_TOKEN
const ref = process.env.VITE_SUPABASE_URL?.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
if (!token || !ref) {
  console.error('Set SUPABASE_ACCESS_TOKEN and VITE_SUPABASE_URL in .env')
  process.exit(1)
}

export async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`${res.status}: ${body}`)
  return JSON.parse(body)
}

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
// spaces and the same guest points. Creates temporary logins and tee times, then removes them.
async function race() {
  const tag = `race-${Date.now()}`
  const ids = await query(`
    insert into auth.users (id, email, aud, role)
      select gen_random_uuid(), '${tag}-' || i || '@example.invalid', 'authenticated', 'authenticated' from generate_series(1, 8) i;
    update public.members m set user_id = u.id from auth.users u
     where u.email = '${tag}-' || m.id || '@example.invalid' and m.user_id is null;
    insert into public.tee_slots (course_id, date, start_time) select 1, current_date + 12, i from generate_series(1, 13) i
      on conflict do nothing;
    select (select json_agg(json_build_object('m', m.id, 'uid', m.user_id) order by m.id) from public.members m
             join auth.users u on u.id = m.user_id where u.email like '${tag}-%') as users,
           (select json_agg(id order by start_time) from public.tee_slots where date = current_date + 12 and start_time between 1 and 13) as slots;`)
  const { users, slots } = ids[0]
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
    const [{ before }] = await query(`select coalesce(sum(points), 0)::int as before from public.guest_visits where member_id = 1 and date_trunc('year', date) = date_trunc('year', current_date + 12)`)
    console.log(`\n2. Declan has ${36 - before} guest points; 12 one-guest bookings (3 pts each) on different times, all at once`)
    const r2 = await Promise.all(slots.slice(1, 13).map(s => as(declan.uid, `public.book_tee_time(${s}, '{}', '[{"name":"Race Guest"}]')`)))
    const [{ used }] = await query(`select sum(points)::int as used from public.guest_visits where member_id = 1 and date_trunc('year', date) = date_trunc('year', current_date + 12)`)
    console.log(`    ${tally(r2)}\n    ${used === 36 ? '✓' : '✗'} points used this year: ${used} of 36 (must not exceed 36)`)
    return n === 4 && used === 36
  } finally {
    await query(`
      delete from public.guest_visits where booking_player_id in (select bp.id from public.booking_players bp join public.tee_slots s on s.id = bp.slot_id where s.date = current_date + 12 and s.start_time between 1 and 13);
      delete from public.tee_slots where date = current_date + 12 and start_time between 1 and 13;
      delete from auth.users where email like '${tag}-%';`)
    console.log('\n    Cleaned up test logins, tee times, bookings and points.')
  }
}

const [cmd, arg] = process.argv.slice(2)
const run = { migrate, seed, test, race: async () => process.exit((await race()) ? 0 : 1), sql: async () => console.log(JSON.stringify(await query(arg), null, 2)) }[cmd]
if (!run) {
  console.error('Usage: node scripts/db.mjs migrate | seed | test | sql "<sql>"')
  process.exit(1)
}
run().catch(e => { console.error(e.message); process.exit(1) })
