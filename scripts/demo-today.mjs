// Demo data (one-off, 28 Oct 2026): today's scores up to lunchtime. Each booked tee time before lunch gets a card for
// its members (guests left off), on that tee time, with the holes they'd have played by lunch (about 14 minutes a
// hole, so the early groups are in and the later ones part-way round), entered in a club Wednesday Stableford today.
// Made-up club-golfer scores. Leaves tee times that already have a card alone; refuses to run twice.   node scripts/demo-today.mjs [--live] [--lunch 12:30]
import { query } from './db.mjs'
import { courseHandicap, shotsOnHole } from '../src/scoring.js'

const at = process.argv.includes('--lunch') ? process.argv[process.argv.indexOf('--lunch') + 1] : '12:30'
const LUNCH = +at.split(':')[0] * 60 + +at.split(':')[1], PER_HOLE = 14
const [{ d: today }] = await query('select public.club_today()::text d')
const [{ n: already }] = await query(`select count(*)::int n from public.events where name = 'Wednesday Stableford' and start_date = '${today}'`)
if (already) throw new Error('Already run (today’s Wednesday Stableford exists)')

const holes = await query('select par, si from public.holes where course_id = 1 order by n')
const [t] = await query(`select rating, slope from public.tees where course_id = 1 and key = 'white'`)
const tee = { rating: +t.rating, slope: t.slope, par: holes.reduce((s, h) => s + h.par, 0) }
const hcp = Object.fromEntries((await query('select id, hcp_index from public.members')).map(m => [m.id, +m.hcp_index]))
const seen = new Set() // a member booked twice plays on their first card
const groups = (await query(`select s.id, s.start_time, array_agg(bp.member_id order by bp.id) filter (where bp.member_id is not null) ids
  from public.tee_slots s join public.booking_players bp on bp.slot_id = s.id
  where s.date = '${today}' and s.start_time < ${LUNCH} and not exists (select 1 from public.rounds r where r.slot_id = s.id) group by s.id, s.start_time order by s.start_time`))
  .map(g => ({ ...g, ids: (g.ids ?? []).map(Number).filter(id => id in hcp && !seen.has(id) && seen.add(id)), played: Math.min(18, Math.floor((LUNCH - g.start_time) / PER_HOLE)) }))
  .filter(g => g.ids.length && g.played > 0)
if (!groups.length) throw new Error('No tee times booked before lunch today')

let seed = 20261028
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
// A club golfer's hole: net par give or take; a good or bad day moves the whole round.
const form = {}
const grossHole = (id, h) => {
  const ch = courseHandicap(hcp[id] ?? 18, tee), x = rnd() + (form[id] ??= (rnd() - 0.5) * 0.35)
  return Math.max(2, h.par + shotsOnHole(ch, h.si) + (x < 0.15 ? -1 : x < 0.62 ? 0 : x < 0.9 ? 1 : 2))
}
const q = v => `'${JSON.stringify(v).replace(/'/g, "''")}'`
const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

const field = groups.flatMap(g => g.ids)
let sql = `begin;
insert into public.events (name, start_date, days, style, fmt, club, everyone, self_entry, entry_required, created_by, players, team, matches, team_a, team_b)
  values ('Wednesday Stableford', '${today}', 1, 'individual', 'stab', true, true, true, true, (select id from public.members where admin order by id limit 1), '{${field}}', '{}', '{}', '{"col": "#19335A", "name": "Blues"}', '{"col": "#762A43", "name": "Reds"}');\n`
const EVENT = `(select id from public.events where name = 'Wednesday Stableford' and start_date = '${today}')` // all in one go
for (const g of groups) {
  const scores = holes.map((h, i) => g.ids.map(id => (i < g.played ? grossHole(id, h) : h.par)))
  sql += `with r as (insert into public.rounds (date, created_by, game, pairing, scores, done, submitted, lineup, slot_id, tee_time)
  values ('${today}', ${g.ids[0]}, 'stab', 0, ${q(scores)}, ${q(holes.map((_, i) => i < g.played))}, '{}', ${q(g.ids.map(m => ({ m })))}, ${g.id}, '${hhmm(g.start_time)}') returning id)
insert into public.event_entries (event_id, day, member_id, round_id, marker) select ${EVENT}, 1, m.id, r.id, m.mk::jsonb from r, (values ${g.ids.map((id, k) => `(${id}, ${q({ m: g.ids[(k + 1) % g.ids.length] })})`).join(', ')}) m(id, mk);\n`
}
await query(sql + 'commit;')
console.log(`Wednesday Stableford: ${groups.length} cards, ${field.length} players; ${groups.filter(g => g.played === 18).length} groups in, the rest part-way round at ${at}`)
