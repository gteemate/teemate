// When a day's tee times open for booking, worked out the same way as the database's tee_time_opens_at()
// (UK time). The database decides; this is only for the "Opens Friday at 8pm" banner and the countdown.

const ZONE = 'Europe/London'
const parts = d => Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
  .formatToParts(d).filter(p => p.type !== 'literal').map(p => [p.type, +p.value]))
/** The instant a UK wall-clock time happens (UK is UTC or UTC+1, so two passes settle it either side of a clock change). */
function ukTime(y, mo, d, h, mi) {
  const want = Date.UTC(y, mo - 1, d, h, mi)
  let t = want
  for (let i = 0; i < 2; i++) {
    const p = parts(new Date(t))
    t += want - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
  }
  return new Date(t)
}
const ymd = iso => iso.split('-').map(Number)
const minusDays = (iso, n) => { const [y, m, d] = ymd(iso); return new Date(Date.UTC(y, m - 1, d - n)) } // a UTC midnight carrying the calendar date

/** Date when tee times on dateIso open, or null if always open (a weekday when the rule is weekends only). */
export function opensAt(dateIso, { time, days, weekendsOnly }) {
  const [y, m, d] = ymd(dateIso), dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  if (weekendsOnly && dow >= 1 && dow <= 5) return null
  const day = minusDays(dateIso, days), [h, mi] = time.split(':').map(Number)
  return ukTime(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), h, mi)
}

/** "8pm", "8.30pm", "12am" (as the database's release_time_label). */
export function timeLabel(time) {
  const [h, m] = time.split(':').map(Number)
  return `${h % 12 || 12}${m ? `.${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`
}

/** "Opens Friday 23 October at 8pm" */
export function openLabel(dateIso, rules) {
  const day = minusDays(dateIso, rules.days)
  const name = day.toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })
  return `Opens ${name} at ${timeLabel(rules.time)}`
}

/** "Opens in 2h 14m" / "Opens in 3m 05s" / "Opens in 45s" / "Opening…" for ms still to wait. */
export function countdown(ms) {
  if (ms <= 0) return 'Opening…'
  const t = Math.ceil(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60
  if (h) return `Opens in ${h}h ${m}m`
  if (m) return `Opens in ${m}m ${String(s).padStart(2, '0')}s`
  return `Opens in ${s}s`
}

const hm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
/**
 * After a time goes in the rush: "08:20 has 3 spaces." — the next later tee time with room for the group
 * (or, failing that, the latest earlier one), or "No times left that day for 2 players."
 */
export function nextFreeNote(sheet, afterTime, groupSize) {
  const room = s => s.capacity - s.players.length
  const fits = [...sheet].filter(s => room(s) >= groupSize).sort((a, b) => a.time - b.time)
  const pick = fits.find(s => s.time > afterTime) ?? fits.filter(s => s.time < afterTime).pop()
  if (!pick) return `No times left that day for ${groupSize} player${groupSize === 1 ? '' : 's'}.`
  return `${hm(pick.time)} has ${room(pick)} space${room(pick) === 1 ? '' : 's'}.`
}
