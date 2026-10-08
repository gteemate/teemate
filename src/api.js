// Every data call the app makes goes through this file, so the backend can be swapped
// (Supabase today, AWS later) without touching the screens.
//
// Functions return plain objects in the shapes the screens use (camelCase, no database
// column names) and throw an Error with a message fit to show the user.
import { createClient } from '@supabase/supabase-js'
import { isoDate, today } from './dates.js'

const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: true, detectSessionInUrl: false },
})

const must = ({ data, error }) => {
  if (error) throw new Error(error.message)
  return data
}
const todayIso = () => isoDate(today())

/* ---------- Sign-in (email + password; no emails are sent) ---------- */

export async function getSession() {
  return must(await sb.auth.getSession()).session
}

export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
  if (error) {
    throw new Error(/invalid login credentials/i.test(error.message)
      ? 'Wrong email or password. First time here? Create your account instead.'
      : error.message)
  }
}

/** First sign-in: create a login with a password. Only emails an admin has approved are accepted. */
export async function createAccount(email, password) {
  const { data, error } = await sb.auth.signUp({ email: email.trim().toLowerCase(), password })
  if (error) {
    throw new Error(/already registered|already exists/i.test(error.message)
      ? "There's already an account for that email. Sign in instead, or ask the admin to reset your login."
      : error.message)
  }
  if (!data.session) throw new Error('Account created, but sign-in failed. Try signing in.')
}

export async function changePassword(password) {
  must(await sb.auth.updateUser({ password }))
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

/* ---------- Club colours ---------- */

/** { main, accent } hex codes. Works before signing in. */
export async function getTheme() {
  return must(await sb.rpc('get_theme'))
}

export async function setTheme(main, accent) {
  must(await sb.rpc('admin_set_theme', { p_main: main, p_accent: accent }))
}

/* ---------- Members and buddies ---------- */

const MEMBER_COLS = 'id, name, gui, hcp_index, admin'
const toMember = m => ({ id: m.id, name: m.name, gui: m.gui, hcp: Number(m.hcp_index), admin: m.admin })

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

/* ---------- Access (admins only) ---------- */

/** Everyone, with email and whether they've created an account: [{ id, name, gui, hcp, email, admin, signedIn }] */
export async function getAccessList() {
  return must(await sb.rpc('admin_list_members')).map(m => ({ ...m, hcp: Number(m.hcp) }))
}

/**
 * Add (no id) or update a member. An email approves them to create an account; a blank email
 * removes access (and deletes their login). Returns the member id.
 */
export async function saveMember(m) {
  const id = must(await sb.rpc('admin_save_member', {
    p_id: m.id ?? null, p_name: m.name, p_email: m.email ?? '', p_gui: m.gui ?? '',
    p_hcp: m.hcp, p_admin: !!m.admin,
  }))
  me = undefined // in case I edited myself
  return id
}

/** People who asked for access: [{ id, name, email, createdAt }], oldest first. Admins only. */
export async function getAccessRequests() {
  return must(await sb.from('access_requests').select('id, name, email, created_at').order('created_at'))
    .map(r => ({ id: r.id, name: r.name, email: r.email, createdAt: r.created_at }))
}

export async function declineRequest(id) {
  must(await sb.rpc('admin_decline_request', { p_id: id }))
}

/** Leave your name for an admin to approve. Works before signing in. */
export async function requestAccess(email, name) {
  must(await sb.rpc('request_access', { p_email: email, p_name: name }))
}

/** Delete a member's login (e.g. forgotten password) but keep their email approved. */
export async function resetLogin(id) {
  must(await sb.rpc('admin_reset_login', { p_id: id }))
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

// lineup: the card's players in order, each { m: memberId } or { g: guestId }; the first is the card's owner.
const ROUND_COLS = 'id, created_by, lineup, slot_id, game, pairing, scores, done, submitted, tee_time'
const toRound = r => ({ id: r.id, lineup: r.lineup, slotId: r.slot_id, game: r.game, pairing: r.pairing, scores: r.scores, done: r.done, submitted: r.submitted })

/** My scorecard for today, or null if I haven't started one. */
export async function getCurrentRound() {
  const r = must(await sb.from('rounds').select(ROUND_COLS).eq('date', todayIso()).eq('created_by', await myId())
    .order('id', { ascending: false }).limit(1).maybeSingle())
  return r && toRound(r)
}

/** Insert or update my scorecard. A new round gets its id set. */
export async function saveRound(round) {
  const row = { lineup: round.lineup, slot_id: round.slotId ?? null, game: round.game, pairing: round.pairing, scores: round.scores, done: round.done, submitted: round.submitted, updated_at: new Date().toISOString() }
  if (round.id) must(await sb.from('rounds').update(row).eq('id', round.id))
  else round.id = must(await sb.from('rounds').insert({ ...row, date: todayIso() }).select('id').single()).id
}

/**
 * Everyone's round today: [{ member, gross: [...completed holes], teeTime?, live }]. My group comes first.
 * Guests appear as member-like entries { id: 'g<id>', name, hcp, guest: true } (hcp 0 until it's set).
 */
export async function getTodayRounds(date = today()) {
  const [rounds, members, meId] = await Promise.all([
    sb.from('rounds').select(ROUND_COLS).eq('date', isoDate(date)).order('id').then(must),
    getMembers(),
    myId(),
  ])
  const guests = await getGuests([...new Set(rounds.flatMap(r => r.lineup.filter(e => e.g != null).map(e => e.g)))])
  const byKey = new Map([
    ...members.map(m => [`m${m.id}`, m]),
    ...guests.map(g => [`g${g.id}`, { id: `g${g.id}`, name: g.name, hcp: g.hcp ?? 0, guest: true }]),
  ])
  rounds.sort((a, b) => (b.created_by === meId) - (a.created_by === meId))
  const seen = new Set(), out = []
  for (const r of rounds) {
    let played = r.done.findIndex(d => !d)
    if (played === -1) played = r.done.length
    r.lineup.forEach((e, k) => {
      const key = e.m != null ? `m${e.m}` : `g${e.g}`
      if (seen.has(key) || !byKey.has(key)) return
      seen.add(key)
      out.push({ member: byKey.get(key), gross: r.scores.slice(0, played).map(s => s[k]), teeTime: r.tee_time ?? undefined, live: true })
    })
  }
  return out
}

/* ---------- Player events (one group challenges another) ---------- */

/**
 * Player events I'm part of from today on (RLS: only the two groups and admins see them).
 * [{ id, date, style, format, teamNames: {A,B}, players: [{ id, name, memberId, guest, group, team }],
 *    status, timeA, timeB, slotA, slotB, createdBy: { id, name }, respondedBy: { id, name } | null }]
 */
export async function getMyPlayerEvents() {
  const rows = must(await sb.from('player_events')
    .select('id, date, style, format, team_names, players, status, slot_a, slot_b, a:slot_a(start_time), b:slot_b(start_time), creator:created_by(id, name), responder:responded_by(id, name)')
    .gte('date', todayIso()).order('created_at', { ascending: false }))
  const meId = await myId()
  return rows
    .filter(e => e.players.some(p => p.memberId === meId)) // admins see all; the Scores tab only shows mine
    .map(e => ({
      id: e.id, date: e.date, style: e.style, format: e.format, teamNames: e.team_names, players: e.players, status: e.status,
      slotA: e.slot_a, slotB: e.slot_b, timeA: e.a.start_time, timeB: e.b.start_time, createdBy: e.creator, respondedBy: e.responder,
    }))
}

/** Propose an event from my tee time to another group's. teams (Ryder Cup): { bookingPlayerId: 'A' | 'B' }. */
export async function proposePlayerEvent({ slotA, slotB, style, format, teamNames, teams = {} }) {
  return must(await sb.rpc('create_player_event', { p_slot_a: slotA, p_slot_b: slotB, p_style: style, p_format: format, p_team_names: teamNames, p_teams: teams }))
}

export async function answerPlayerEvent(id, accept) {
  must(await sb.rpc('respond_player_event', { p_id: id, p_accept: accept }))
}

export async function cancelPlayerEvent(id) {
  must(await sb.rpc('cancel_player_event', { p_id: id }))
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
