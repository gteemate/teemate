// Every data call the app makes goes through this file, so the backend can be swapped
// (Supabase today, AWS later) without touching the screens.
//
// Functions return plain objects in the shapes the screens use (camelCase, no database
// column names) and throw an Error with a message fit to show the user.
import { createClient } from '@supabase/supabase-js'
import { isoDate, today } from './dates.js'

const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
  // Implicit flow: the magic link works even if it's opened on a different device from the one that asked for it.
  auth: { flowType: 'implicit', persistSession: true, detectSessionInUrl: true },
})

const must = ({ data, error }) => {
  if (error) throw new Error(error.message)
  return data
}
const todayIso = () => isoDate(today())

/* ---------- Sign-in ---------- */

export async function getSession() {
  return must(await sb.auth.getSession()).session
}

/** Email a magic sign-in link that brings the user back to this app. */
export async function sendMagicLink(email) {
  must(await sb.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: location.origin + import.meta.env.BASE_URL },
  }))
}

export async function signOut() {
  me = undefined
  must(await sb.auth.signOut())
}

/** cb(event) on sign-in, sign-out, token refresh. */
export function onAuthChange(cb) {
  sb.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') me = undefined
    cb(event)
  })
}

/* ---------- Members and buddies ---------- */

const MEMBER_COLS = 'id, name, gui, hcp_index, committee'
const toMember = m => ({ id: m.id, name: m.name, gui: m.gui, hcp: Number(m.hcp_index), committee: m.committee })

let me // cached for the session; undefined = not loaded, null = signed in but not a member
/** The signed-in member, or null if this login isn't on the members list. */
export async function getMe() {
  if (me !== undefined) return me
  const id = must(await sb.rpc('current_member_id'))
  me = id == null ? null : toMember(must(await sb.from('members').select(MEMBER_COLS).eq('id', id).single()))
  return me
}
const myId = async () => (await getMe())?.id

export async function getMembers() {
  return must(await sb.from('members').select(MEMBER_COLS).order('id')).map(toMember)
}

export async function getBuddies() {
  return must(await sb.from('buddies').select('buddy_id')).map(r => r.buddy_id)
}

export async function addBuddy(id) {
  must(await sb.from('buddies').upsert({ member_id: await myId(), buddy_id: id }, { ignoreDuplicates: true }))
}

export async function removeBuddy(id) {
  must(await sb.from('buddies').delete().eq('buddy_id', id))
}

/* ---------- Course and pins ---------- */

let course // the course doesn't change while the app is open
export async function getCourse() {
  if (course) return structuredClone(course)
  const c = must(await sb.from('courses').select('id, name, guest_points, tees(key, name, colour, rating, slope, sort), holes(n, name, par, si, green_depth, yards)').order('id').limit(1).single())
  course = {
    id: c.id,
    name: c.name,
    guestPoints: c.guest_points,
    tees: c.tees.sort((a, b) => a.sort - b.sort).map(t => ({ key: t.key, name: t.name, colour: t.colour, rating: t.rating == null ? null : Number(t.rating), slope: t.slope })),
    holes: c.holes.sort((a, b) => a.n - b.n).map(h => ({ n: h.n, name: h.name, par: h.par, si: h.si, greenDepth: h.green_depth, yards: h.yards })),
  }
  return structuredClone(course)
}

const hhmmLocal = ts => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

/** The pins in play on a date: that day's sheet, or the latest one before it. */
export async function getPins(date = today()) {
  const c = await getCourse()
  const row = must(await sb.from('pin_sheets').select('date, set_at, pins, setter:set_by(name)')
    .eq('course_id', c.id).lte('date', isoDate(date)).order('date', { ascending: false }).limit(1).maybeSingle())
  if (!row) return { setAt: '–', setBy: 'nobody yet', pins: c.holes.map(h => ({ hole: h.n, yardsOn: Math.round(h.greenDepth / 2), side: 'C' })) }
  return { setAt: hhmmLocal(row.set_at), setBy: row.setter?.name ?? 'Head greenkeeper', pins: row.pins }
}

export async function publishPins(pins) {
  const c = await getCourse()
  must(await sb.from('pin_sheets').upsert({ course_id: c.id, date: todayIso(), set_at: new Date().toISOString(), set_by: await myId(), pins }))
}

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

export async function getMyBookings() {
  return must(await sb.rpc('get_my_bookings'))
}

/* ---------- Guest points ---------- */

export async function getGuestPoints(year = String(today().getFullYear())) {
  const [c, settings, visits, members, meId] = await Promise.all([
    getCourse(),
    sb.from('club_settings').select('guest_allowance').single().then(must),
    // RLS returns only my visits, or everyone's for the committee.
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

/* ---------- Games ---------- */

export async function getGameSettings() {
  const [rows, prefs] = await Promise.all([
    sb.from('game_settings').select('game_key, enabled, allowance_pct').then(must),
    sb.from('game_prefs').select('group_size, game_key').then(must),
  ])
  const settings = {}
  for (const r of rows) settings[r.game_key] = { on: r.enabled, ...(r.allowance_pct == null ? {} : { pct: r.allowance_pct }) }
  return { settings, pref: Object.fromEntries(prefs.map(p => [p.group_size, p.game_key])) }
}

/** changes: { on?: boolean, pct?: number } */
export async function updateGame(k, changes) {
  const cur = must(await sb.from('game_settings').select('enabled, allowance_pct').eq('game_key', k).maybeSingle())
  must(await sb.from('game_settings').upsert({
    game_key: k,
    enabled: changes.on ?? cur?.enabled ?? true,
    allowance_pct: changes.pct ?? cur?.allowance_pct ?? null,
  }))
}

export async function setPreferredGame(groupSize, k) {
  must(await sb.from('game_prefs').upsert({ group_size: groupSize, game_key: k }))
}

/* ---------- Rounds and leaderboard ---------- */

const ROUND_COLS = 'id, created_by, players, game, pairing, scores, done, submitted, tee_time'
const toRound = r => ({ id: r.id, players: r.players, game: r.game, pairing: r.pairing, scores: r.scores, done: r.done, submitted: r.submitted })

/** My scorecard for today, or null if I haven't started one. */
export async function getCurrentRound() {
  const r = must(await sb.from('rounds').select(ROUND_COLS).eq('date', todayIso()).eq('created_by', await myId())
    .order('id', { ascending: false }).limit(1).maybeSingle())
  return r && toRound(r)
}

/** Insert or update my scorecard. A new round gets its id set. */
export async function saveRound(round) {
  const row = { players: round.players, game: round.game, pairing: round.pairing, scores: round.scores, done: round.done, submitted: round.submitted, updated_at: new Date().toISOString() }
  if (round.id) must(await sb.from('rounds').update(row).eq('id', round.id))
  else round.id = must(await sb.from('rounds').insert({ ...row, date: todayIso() }).select('id').single()).id
}

/** Everyone's round today: [{ member, gross: [...completed holes], teeTime?, live }]. My group comes first. */
export async function getTodayRounds(date = today()) {
  const [rounds, members, meId] = await Promise.all([
    sb.from('rounds').select(ROUND_COLS).eq('date', isoDate(date)).order('id').then(must),
    getMembers(),
    myId(),
  ])
  const byId = new Map(members.map(m => [m.id, m]))
  rounds.sort((a, b) => (b.created_by === meId) - (a.created_by === meId))
  const seen = new Set(), out = []
  for (const r of rounds) {
    let played = r.done.findIndex(d => !d)
    if (played === -1) played = r.done.length
    r.players.forEach((id, k) => {
      if (seen.has(id) || !byId.has(id)) return
      seen.add(id)
      out.push({ member: byId.get(id), gross: r.scores.slice(0, played).map(s => s[k]), teeTime: r.tee_time ?? undefined, live: true })
    })
  }
  return out
}

/* ---------- Team events ---------- */

const EVENT_COLS = 'id, name, team_a, team_b, active, days, course, format, players, team, matches'
const toEvent = e => ({ id: e.id, name: e.name, A: e.team_a, B: e.team_b, active: e.active, days: e.days, course: e.course, format: e.format, players: e.players, team: e.team, matches: e.matches })

export async function getEvents() {
  return must(await sb.from('events').select(EVENT_COLS).order('id')).map(toEvent)
}

export async function createEvent() {
  return toEvent(must(await sb.from('events').insert({
    name: 'New event', team_a: { name: 'Team A', col: '#19335A' }, team_b: { name: 'Team B', col: '#762A43' },
    days: 1, course: 'Ailsa · White tees', format: 'Better ball · off the low',
  }).select(EVENT_COLS).single()))
}

/** Save an event. Only one event can be active, so activating one deactivates the rest. */
export async function saveEvent(e) {
  must(await sb.from('events').update({
    name: e.name, team_a: e.A, team_b: e.B, days: e.days, course: e.course, format: e.format,
    players: e.players, team: e.team, matches: e.matches,
  }).eq('id', e.id))
  must(await sb.rpc('set_active_event', { p_event_id: e.id, p_active: e.active }))
}
