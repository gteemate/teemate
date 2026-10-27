// Demo data (one-off, 27 Oct 2026): Winter League Live (event 106) and the Saturday Stableford (event 1390).
// League: week 1's unfinished cards are finished and most of the league has a week 1 round; most play in week 2; about
// half have played week 3 so far (its 10 holes). Saturday Stableford (10 Oct): a full field of 40 on 3- and 4-ball
// cards, all 18 holes. Made-up club-golfer scores. Refuses to run twice.   node scripts/demo-league-weeks.mjs --live
import { query } from './db.mjs'
import { courseHandicap, shotsOnHole } from '../src/scoring.js'
import { addDaysIso } from '../src/dates.js'

const LEAGUE = 106, STAB = 1390
const [lg] = await query(`select * from public.events where id = ${LEAGUE}`)
const [st] = await query(`select * from public.events where id = ${STAB}`)
if (!lg || lg.style !== 'league' || !st || st.style !== 'individual') throw new Error('Winter League Live or Saturday Stableford not found')
const [{ n: done2 }] = await query(`select count(*)::int n from public.league_entries where event_id = ${LEAGUE} and week = 2`)
const [{ n: doneSt }] = await query(`select count(*)::int n from public.event_entries where event_id = ${STAB}`)
if (done2 || doneSt) throw new Error('Already run (week 2 or the Saturday Stableford has entries)')

const holes = await query('select par, si from public.holes where course_id = 1 order by n')
const [t] = await query(`select rating, slope from public.tees where course_id = 1 and key = 'white'`)
const tee = { rating: +t.rating, slope: t.slope, par: holes.reduce((s, h) => s + h.par, 0) }
const hcp = Object.fromEntries((await query('select id, hcp_index from public.members')).map(m => [m.id, +m.hcp_index]))

let seed = 20261027
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
const shuffle = list => list.map(x => [rnd(), x]).sort((p, q) => p[0] - q[0]).map(p => p[1])
// A club golfer's hole: net par give or take; a good or bad day moves the whole round.
const form = {}
const grossHole = (id, h) => {
  const ch = courseHandicap(hcp[id] ?? 18, tee), x = rnd() + (form[id] ??= (rnd() - 0.5) * 0.35)
  return Math.max(2, h.par + shotsOnHole(ch, h.si) + (x < 0.15 ? -1 : x < 0.62 ? 0 : x < 0.9 ? 1 : 2))
}
const q = v => `'${JSON.stringify(v).replace(/'/g, "''")}'`
// Cards of 3 and 4 (a 2-ball if 2 are left over), each on a date in the list.
const cardsOf = (ids, dates) => {
  const out = []
  for (let i = 0, k = 0; i < ids.length; k++) {
    const left = ids.length - i, size = left === 5 ? 3 : left <= 4 ? left : rnd() < 0.6 ? 4 : 3
    out.push({ date: dates[k % dates.length], ids: ids.slice(i, i + size) }); i += size
  }
  return out
}
const roundSql = (c, open) => { // open: the holes played (0-based); the rest stay unplayed
  const scores = holes.map((h, i) => c.ids.map(id => (open.includes(i) ? grossHole(id, h) : h.par)))
  return `insert into public.rounds (date, created_by, game, pairing, scores, done, submitted, lineup)
  values ('${c.date}', ${c.ids[0]}, 'stab', 0, ${q(scores)}, ${q(holes.map((_, i) => open.includes(i)))}, '{}', ${q(c.ids.map(m => ({ m })))}) returning id`
}
const marker = (c, id) => ({ m: c.ids[(c.ids.indexOf(id) + 1) % c.ids.length] }) // the next one on the card marks them
const ALL = holes.map((_, i) => i)

let sql = 'begin;\n'
// --- The league ---
const players = lg.players.map(Number).filter(id => id in hcp), week = w => addDaysIso(lg.start_date, 7 * (w - 1))
const weekHoles = w => (lg.day_rules?.[w]?.holes ?? lg.holes ?? null)?.map(n => n - 1) ?? ALL
const entered = async w => new Set((await query(`select member_id from public.league_entries where event_id = ${LEAGUE} and week = ${w}`)).map(r => +r.member_id))
// Week 1: finish the cards left part-played, then most of the rest play.
const part = await query(`select r.id, r.lineup, r.scores, r.done from public.rounds r where r.id in (select round_id from public.league_entries where event_id = ${LEAGUE} and week = 1)
  and exists (select 1 from jsonb_array_elements(r.done) d where d = 'false')`)
for (const r of part) {
  const ids = r.lineup.map(x => x.m ?? null)
  const scores = r.scores.map((row, i) => (r.done[i] ? row : row.map((s, k) => (ids[k] != null ? grossHole(ids[k], holes[i]) : s))))
  sql += `update public.rounds set scores = ${q(scores)}, done = ${q(holes.map(() => true))} where id = ${r.id};\n`
}
const plan = [[1, 0.85, ALL], [2, 0.85, weekHoles(2)], [3, 0.5, weekHoles(3)]]
const added = {}
for (const [w, share, open] of plan) {
  const already = await entered(w), want = Math.round(players.length * share) - already.size
  const ids = shuffle(players.filter(id => !already.has(id))).slice(0, Math.max(0, want))
  const dates = w === 3 ? [0, 1, 2, 3, 4, 5].map(d => addDaysIso(week(3), d)) : [0, 2, 3, 5, 6].map(d => addDaysIso(week(w), d)) // week 3: up to today
  const cards = cardsOf(ids, dates)
  for (const c of cards) sql += `with r as (${roundSql(c, open)})
insert into public.league_entries (event_id, week, member_id, round_id, marker) select ${LEAGUE}, ${w}, m.id, r.id, m.mk::jsonb from r, (values ${c.ids.map(id => `(${id}, ${q(marker(c, id))})`).join(', ')}) m(id, mk);\n`
  added[w] = ids.length
}
// --- The Saturday Stableford: a field of 40 ---
const pool = (await query(`select id from public.members where not office and hcp_index < 36 order by id`)).map(m => +m.id)
const field = [...new Set([...st.players.map(Number).filter(id => id in hcp), ...shuffle(pool.filter(id => !st.players.map(Number).includes(id)))])].slice(0, 40)
for (const c of cardsOf(field, [st.start_date])) sql += `with r as (${roundSql(c, ALL)})
insert into public.event_entries (event_id, day, member_id, round_id, marker) select ${STAB}, 1, m.id, r.id, m.mk::jsonb from r, (values ${c.ids.map(id => `(${id}, ${q(marker(c, id))})`).join(', ')}) m(id, mk);\n`
sql += `update public.events set players = '{${field}}' where id = ${STAB};\n`

await query(sql + 'commit;')
console.log(`League: ${part.length} week 1 cards finished; added week 1 ${added[1]}, week 2 ${added[2]}, week 3 ${added[3]}. Saturday Stableford: ${field.length} players.`)
