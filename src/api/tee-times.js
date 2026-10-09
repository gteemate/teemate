import { isoDate, today } from '../dates.js'
import { must, myId, sb } from './client.js'
import { getMembers } from './members.js'
import { getCourse } from './course.js'

/* ---------- Tee times ---------- */

export async function getTeeSheet(date) {
  return must(await sb.rpc('get_tee_sheet', { p_date: date }))
}

/**
 * Book a tee time for me plus buddies and guests in one step. The database checks spaces
 * and guest points in the same transaction and throws if either has run out.
 */
export async function bookTeeTime({ slotId, memberIds = [], guests = [] }) {
  return must(await sb.rpc('book_tee_time', { p_slot_id: slotId, p_member_ids: memberIds, p_guests: guests }))
}

/** My tee times on a date, each with everyone on it (members and guests, with handicaps). */
export async function getMyTeeTimes(date) {
  const meId = await myId()
  return (await getTeeSheet(isoDate(date))).filter(s => s.players.some(p => p.memberId === meId))
}

/** Guests by booking id: [{ id, name, club, hcp }] (hcp null if not set yet). */
export async function getGuests(ids) {
  if (!ids.length) return []
  return must(await sb.rpc('get_guests', { p_ids: ids })).map(g => ({ ...g, hcp: g.hcp == null ? null : Number(g.hcp) }))
}

/** Set or clear (null) a guest's handicap index. Anyone on that tee time can, at any time. */
export async function setGuestHandicap(guestId, hcp) {
  must(await sb.rpc('set_guest_handicap', { p_guest_id: guestId, p_hcp: hcp }))
}

/** Cancel a booking: deletes it if I made it (guest points back), otherwise withdraws me. A scorecard with holes saved
 *  goes too only when removeScores (the member confirmed). → { result, pointsBack, cardsRemoved } */
export async function cancelBooking(id, removeScores = false) {
  return must(await sb.rpc('cancel_booking', { p_booking: id, p_remove_scores: removeScores }))
}

export async function getMyBookings() {
  return must(await sb.rpc('get_my_bookings'))
}

/* ---------- Guest points ---------- */

export async function getGuestPoints(year = String(today().getFullYear())) {
  const [c, settings, visits, members, meId] = await Promise.all([
    getCourse(),
    sb.from('club_settings').select('guest_allowance').single().then(must),
    // RLS returns only my visits, or everyone's for an admin.
    sb.from('guest_visits').select('member_id, date, guest_name, guest_club, points, course:course_id(name)')
      .gte('date', `${year}-01-01`).lte('date', `${year}-12-31`).order('date').then(must),
    getMembers(),
    myId(),
  ])
  return {
    allowance: settings.guest_allowance,
    cost: c.guestPoints,
    course: c.name,
    mine: visits.filter(v => v.member_id === meId).map(v => ({ date: v.date, guest: v.guest_name, club: v.guest_club || '', course: v.course?.name ?? c.name, points: v.points })),
    members: members.map(m => ({ id: m.id, name: m.name, used: visits.filter(v => v.member_id === m.id).reduce((t, v) => t + v.points, 0) })),
  }
}

/* ---------- Release: when tee times open for booking ---------- */

/** { time: '20:00', days: 8, weekendsOnly: false, now: Date } — now is the database's clock, for the countdown. */
export async function getBookingRules() {
  const r = must(await sb.rpc('get_booking_rules'))
  return { time: r.time, days: r.days, weekendsOnly: r.weekendsOnly, now: new Date(r.now) }
}

/** Admins only. time 'HH:MM', days 1–13. */
export async function setBookingRules({ time, days, weekendsOnly }) {
  must(await sb.rpc('admin_set_booking_rules', { p_time: time, p_days: days, p_weekends_only: weekendsOnly }))
}

/* ---------- Tee time requests (a day not open yet; an admin approves = booked as you) ---------- */

const toRequest = r => ({ id: r.id, memberId: r.member_id, member: r.member, slotId: r.slot_id, date: r.slot?.date, time: r.slot?.start_time,
  memberIds: r.member_ids, guests: r.guests, reason: r.reason, status: r.status, note: r.admin_note, decidedAt: r.decided_at, seen: r.seen, createdAt: r.created_at })
const REQUEST_COLS = 'id, member_id, slot_id, member_ids, guests, reason, status, admin_note, decided_at, seen, created_at, slot:slot_id(date, start_time), member:member_id(id, name)'

/** Ask for a tee time on a day not open yet. Returns the request id. */
export async function requestTeeTime({ slotId, memberIds = [], guests = [], reason }) {
  return must(await sb.rpc('request_tee_time', { p_slot_id: slotId, p_member_ids: memberIds, p_guests: guests, p_reason: reason }))
}
export async function cancelTeeTimeRequest(id) { must(await sb.rpc('cancel_tee_time_request', { p_id: id })) }
/** My requests, newest first. */
export async function getMyTeeTimeRequests() {
  const me = await myId()
  return must(await sb.from('tee_time_requests').select(REQUEST_COLS).eq('member_id', me).order('created_at', { ascending: false })).map(toRequest)
}
/** Admins: every request, waiting ones first (oldest first), then recent answers. */
export async function getTeeTimeRequests() {
  const rows = must(await sb.from('tee_time_requests').select(REQUEST_COLS).order('created_at')).map(toRequest)
  return [...rows.filter(r => r.status === 'pending'), ...rows.filter(r => r.status !== 'pending').reverse()]
}
/** Admins: approve (books it as the member) or decline with a note. */
export async function decideTeeTimeRequest(id, approve, note = null) {
  return must(await sb.rpc('admin_decide_tee_time_request', { p_id: id, p_approve: approve, p_note: note }))
}
export async function markTeeTimeRequestsSeen() { must(await sb.rpc('mark_tee_time_requests_seen')) }
