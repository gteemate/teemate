import { isoDate, today } from '../dates.js'
import { must, myId, sb, todayIso } from './client.js'

/* ---------- Course and pins ---------- */

let course // the course doesn't change while the app is open
export async function getCourse() {
  if (course) return structuredClone(course)
  const c = must(await sb.from('courses').select('id, name, guest_points, tees(key, name, colour, rating, slope, sort), holes(n, name, par, si, green_depth, green_width, green_width_estimated, yards)').order('id').limit(1).single())
  course = {
    id: c.id,
    name: c.name,
    guestPoints: c.guest_points,
    tees: c.tees.sort((a, b) => a.sort - b.sort).map(t => ({ key: t.key, name: t.name, colour: t.colour, rating: t.rating == null ? null : Number(t.rating), slope: t.slope })),
    holes: c.holes.sort((a, b) => a.n - b.n).map(h => ({ n: h.n, name: h.name, par: h.par, si: h.si, greenDepth: h.green_depth, greenWidth: h.green_width, greenWidthEstimated: h.green_width_estimated, yards: h.yards })),
  }
  return structuredClone(course)
}

const hhmmLocal = ts => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

/** The pins in play on a date: that day's sheet, or the latest one before it. */
export async function getPins(date = today()) {
  const c = await getCourse()
  const row = must(await sb.from('pin_sheets').select('date, set_at, pins, setter:set_by(name)')
    .eq('course_id', c.id).lte('date', isoDate(date)).order('date', { ascending: false }).limit(1).maybeSingle())
  if (!row) return { setAt: '–', setBy: 'nobody yet', pins: c.holes.map(h => ({ hole: h.n, yardsOn: Math.round(h.greenDepth / 2), fromLeft: Math.round(h.greenWidth / 2), depthRef: 'front', sideRef: 'left' })) }
  return { date: row.date, setAt: hhmmLocal(row.set_at), setBy: row.setter?.name ?? 'Head greenkeeper', pins: row.pins }
}

/** Correct a green's width (admins). */
export async function setGreenWidth(hole, width) {
  must(await sb.rpc('admin_set_green_width', { p_hole: hole, p_width: width }))
  course = null // reload the course with the new width
}

/** pins: [{ hole, yardsOn (from front), fromLeft, depthRef: 'front'|'back', sideRef: 'left'|'right' }] */
export async function publishPins(pins) {
  const c = await getCourse()
  must(await sb.from('pin_sheets').upsert({ course_id: c.id, date: todayIso(), set_at: new Date().toISOString(), set_by: await myId(), pins }))
}
