// Demo data (one-off): a busy week on the tee sheet. For each day from today for 7 days: the day's tee times made
// as the app makes them (get_tee_sheet), then about 60% of the places filled with groups of 2–4 (members, the odd
// guest), nobody booked twice in a day, tee times that already have bookings left alone.
//   node scripts/demo-tee-sheet.mjs [--live]
import { query } from './db.mjs'
import { addDaysIso, isoDate, today } from '../src/dates.js'

const DAYS = 7, FILL = 0.6
let seed = 20261026
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
const shuffle = list => list.map(x => [rnd(), x]).sort((p, q) => p[0] - q[0]).map(p => p[1])
const GUESTS = [['Sam Visitor', 'Royal Portrush'], ['Pat Kelly', 'Malone'], ['Chris Byrne', 'Ballyclare'], ['Alex Moore', 'Castlerock'], ['Jo Hughes', 'Galgorm Castle']]

const members = (await query(`select id from public.members where not office and name not in ('Halfway Hut', 'Club Office', 'New Joiner') order by id`)).map(m => +m.id)
let sql = 'begin;\n'
const report = []
for (let d = 0; d < DAYS; d++) {
  const date = addDaysIso(isoDate(today()), d)
  // The day's tee times, as get_tee_sheet makes them.
  sql += `insert into public.tee_slots (course_id, date, start_time, twilight) select (select id from public.courses order by id limit 1), '${date}', m, m >= 15 * 60
  from generate_series(7 * 60 + 30, 16 * 60 + 30, 10) m where not (m >= 12 * 60 + 20 and m < 13 * 60) on conflict do nothing;\n`
  const times = []; for (let m = 450; m <= 990; m += 10) if (!(m >= 740 && m < 780)) times.push(m)
  const booked = new Set((await query(`select bp.member_id from public.booking_players bp join public.tee_slots t on t.id = bp.slot_id where t.date = '${date}' and bp.member_id is not null`)).map(x => +x.member_id))
  const busy = new Set((await query(`select t.start_time from public.tee_slots t where t.date = '${date}' and exists (select 1 from public.booking_players bp where bp.slot_id = t.id)`)).map(x => x.start_time))
  const free = shuffle(members.filter(m => !booked.has(m)))
  const target = Math.round(times.length * 4 * FILL)
  let placed = 0, groups = 0
  for (const t of shuffle(times.filter(t => !busy.has(t)))) {
    if (placed >= target || free.length < 2) break
    const size = Math.min([4, 4, 4, 3, 3, 2][Math.floor(rnd() * 6)], target - placed < 2 ? 2 : target - placed)
    const guest = size > 2 && rnd() < 0.15 ? GUESTS[Math.floor(rnd() * GUESTS.length)] : null
    const ids = free.splice(0, guest ? size - 1 : size)
    const slot = `(select id from public.tee_slots where date = '${date}' and start_time = ${t} and course_id = (select id from public.courses order by id limit 1))`
    sql += `with b as (insert into public.bookings (slot_id, booked_by) values (${slot}, ${ids[0]}) returning id, slot_id)
insert into public.booking_players (booking_id, slot_id, member_id, guest_name, guest_club) select b.id, b.slot_id, p.m, p.g, p.c from b, (values ${[...ids.map(m => `(${m}, null::text, null::text)`), ...(guest ? [`(null::bigint, '${guest[0]}', '${guest[1]}')`] : [])].join(', ')}) p(m, g, c);\n`
    placed += size; groups++
  }
  report.push(`${date}: ${groups} tee times booked, ${placed} of ${times.length * 4} places (${Math.round(placed / (times.length * 4) * 100)}%)`)
}
await query(sql + 'commit;')
console.log(report.join('\n'))
