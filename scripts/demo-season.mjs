// Demo data (one-off): Ballymena V Coleraine (event 2497, set up by Live Tester) as four-ball team match play over a
// season. Started 10 weeks ago, ends 31 Mar 2027; 10 past match days on the weekends, 1–3 matches each (two with all
// 12 out, singles on several), each match on made-up cards counted for the event; tomorrow's 3 matches (as set up)
// are the next match day. Refuses to run twice.   node scripts/demo-season.mjs --live
import { query } from './db.mjs'
import { courseHandicap, shotsOnHole } from '../src/scoring.js'
import { addDaysIso, isoDate, today } from '../src/dates.js'

const EVENT = 2497, END = '2027-03-31'
const [e] = await query(`select * from public.events where id = ${EVENT}`)
if (!e || e.style !== 'ryder') throw new Error('Ballymena V Coleraine (four-ball team match play) not found')
if (e.season) throw new Error('It is already a season: not running again')

const now = isoDate(today()), start = addDaysIso(now, -70)
const dayOf = iso => Math.round((new Date(iso) - new Date(start)) / 864e5) + 1
const A = Object.keys(e.team).filter(k => e.team[k] === 'A').map(Number), B = Object.keys(e.team).filter(k => e.team[k] === 'B').map(Number)
const holes = await query('select par, si from public.holes where course_id = 1 order by n')
const [t] = await query(`select rating, slope from public.tees where course_id = 1 and key = 'white'`)
const tee = { rating: +t.rating, slope: t.slope, par: holes.reduce((s, h) => s + h.par, 0) }
const hcp = Object.fromEntries((await query('select id, hcp_index from public.members')).map(m => [m.id, +m.hcp_index]))
// Friends who play alongside a singles player on their own card: members not in the event.
const friends = (await query(`select id from public.members where id <> all ('{${e.players}}') and not office and id between 138 and 257 order by id limit 20`)).map(m => m.id)

let seed = 20261026
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
const shuffle = list => list.map(x => [rnd(), x]).sort((p, q) => p[0] - q[0]).map(p => p[1])
// A club golfer's round: net par give or take, Stableford mostly 28–38.
const gross = id => {
  const ch = courseHandicap(hcp[id] ?? 18, tee), form = (rnd() - 0.5) * 0.3
  return holes.map(h => { const x = rnd() + form; return Math.max(2, h.par + shotsOnHole(ch, h.si) + (x < 0.15 ? -1 : x < 0.65 ? 0 : x < 0.92 ? 1 : 2)) })
}

// Each match day: how many four-balls and singles (two days with all 12 out).
const PLAN = [[3, 0], [1, 0], [0, 2], [3, 0], [1, 1], [0, 1], [2, 0], [1, 2], [1, 0], [2, 2]]
const matches = {}, cards = [] // cards: { date, ids, entrants }
PLAN.forEach(([fours, singles], w) => {
  const date = addDaysIso(start, 7 * w + (w % 2 ? 6 : 5)), d = dayOf(date) // Saturday or Sunday
  const a = shuffle(A), b = shuffle(B), list = []
  for (let k = 0; k < fours; k++) list.push({ a: a.splice(0, 2), b: b.splice(0, 2) })
  for (let k = 0; k < singles; k++) list.push({ a: a.splice(0, 1), b: b.splice(0, 1) })
  matches[d] = list
  list.forEach((m, k) => {
    const ids = [...m.a, ...m.b]
    if (ids.length === 4 || k % 2 === 0) cards.push({ date, ids, entrants: ids }) // a four-ball, or a singles on one card
    else ids.forEach(id => cards.push({ date, ids: [id, friends[(w * 2 + k + ids.indexOf(id)) % friends.length]], entrants: [id] })) // a singles on two cards
  })
})
matches[dayOf(addDaysIso(now, 1))] = e.matches['1'] ?? [] // tomorrow's three, as set up

let sql = `begin;
update public.events set season = true, start_date = '${start}', days = ${dayOf(END)}, matches = '${JSON.stringify(matches)}' where id = ${EVENT};\n`
for (const c of cards) {
  const g = c.ids.map(gross), scores = holes.map((_, i) => g.map(x => x[i]))
  sql += `with r as (insert into public.rounds (date, created_by, game, pairing, scores, done, submitted, lineup)
  values ('${c.date}', ${c.ids[0]}, 'none', 0, '${JSON.stringify(scores)}', '${JSON.stringify(holes.map(() => true))}', '{}', '${JSON.stringify(c.ids.map(m => ({ m })))}') returning id)
insert into public.event_entries (event_id, day, member_id, round_id) select ${EVENT}, ${dayOf(c.date)}, m, r.id from r, unnest(array[${c.entrants}]::bigint[]) m;\n`
}
await query(sql + 'commit;')
console.log(`Season from ${start} to ${END}: ${PLAN.length} past match days, ${cards.length} cards; next match day ${addDaysIso(now, 1)}.`)
