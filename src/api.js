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

/** True if this email is approved but its account hasn't been created yet (after a failed sign-in). */
export async function needsAccount(email) {
  return must(await sb.rpc('needs_account', { p_email: email }))
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

/** Delete a member completely (admins): their login, bookings, guest points and the cards they created go too. */
export async function deleteMember(id) {
  must(await sb.rpc('admin_delete_member', { p_id: id }))
}

/** Delete a member's login (e.g. forgotten password) but keep their email approved. */
export async function resetLogin(id) {
  must(await sb.rpc('admin_reset_login', { p_id: id }))
}

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
  return { setAt: hhmmLocal(row.set_at), setBy: row.setter?.name ?? 'Head greenkeeper', pins: row.pins }
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

/** Club game settings plus my own preferred game per group size: { settings, pref (club), mine }. */
export async function getGameSettings() {
  const [rows, prefs, mine] = await Promise.all([
    sb.from('game_settings').select('game_key, enabled, allowance_pct').then(must),
    sb.from('game_prefs').select('group_size, game_key').then(must),
    sb.from('member_game_prefs').select('group_size, game_key').then(must),
  ])
  const settings = {}
  for (const r of rows) settings[r.game_key] = { on: r.enabled, ...(r.allowance_pct == null ? {} : { pct: r.allowance_pct }) }
  const byGroup = list => Object.fromEntries(list.map(p => [p.group_size, p.game_key]))
  return { settings, pref: byGroup(prefs), mine: byGroup(mine) }
}

/** Save my preferred game for 2-, 3- or 4-ball cards. */
export async function setMyGamePref(groupSize, k) {
  must(await sb.from('member_game_prefs').upsert({ member_id: await myId(), group_size: groupSize, game_key: k }))
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

/* ---------- Player events (one group challenges others) ---------- */

/**
 * Player events I'm part of, from today on (RLS: only players in the event and admins see them).
 * [{ id, date, style, format, teamNames, status, createdBy: { id, name },
 *    players: [{ id, name, memberId, guest, slot, team }],
 *    groups: [{ slot, time, host, answer, answeredBy: { id, name } | null }] }]   groups in tee-time order
 */
export async function getMyPlayerEvents() {
  const rows = must(await sb.from('player_events')
    .select('id, date, style, format, team_names, players, status, creator:created_by(id, name), player_event_groups(slot_id, host, answer, answerer:answered_by(id, name), tee:slot_id(start_time))')
    .gte('date', todayIso()).order('created_at', { ascending: false }))
  const meId = await myId()
  return rows
    .filter(e => e.players.some(p => p.memberId === meId)) // admins can see all; the Scores tab shows mine
    .map(e => ({
      id: e.id, date: e.date, style: e.style, format: e.format, teamNames: e.team_names, players: e.players, status: e.status,
      createdBy: e.creator,
      groups: e.player_event_groups
        .map(g => ({ slot: g.slot_id, time: g.tee.start_time, host: g.host, answer: g.answer, answeredBy: g.answerer }))
        .sort((a, b) => a.time - b.time),
    }))
}

/**
 * Propose an event from my tee time to other groups the same day.
 * teamNames: { A, B } (ryder/teams) or { "<slot id>": name } (fourball, optional).
 * teams (ryder/teams): { bookingPlayerId: 'A' | 'B' }.
 */
export async function proposePlayerEvent({ hostSlot, invited, style, format, teamNames = {}, teams = {} }) {
  return must(await sb.rpc('create_player_event', { p_host_slot: hostSlot, p_invited: invited, p_style: style, p_format: format, p_team_names: teamNames, p_teams: teams }))
}

export async function answerPlayerEvent(id, accept) {
  must(await sb.rpc('respond_player_event', { p_id: id, p_accept: accept }))
}

export async function cancelPlayerEvent(id) {
  must(await sb.rpc('cancel_player_event', { p_id: id }))
}

/** Each group's scorecard for an event day, by tee time: { [slotId]: round } (cards started from that tee time). */
export async function getCardsForTeeTimes(date, slotIds) {
  const rows = must(await sb.from('rounds').select(ROUND_COLS).eq('date', date).in('slot_id', slotIds).order('updated_at'))
  return Object.fromEntries(rows.map(r => [r.slot_id, toRound(r)])) // latest card per tee time wins
}

/* ---------- Events set up in advance ---------- */

const EVENT_COLS = 'id, name, team_a, team_b, club, everyone, start_date, days, style, fmt, players, team, matches, weeks, best_of, league_teams, creator:created_by(id, name)'
const toEvent = e => ({
  id: e.id, name: e.name, A: e.team_a, B: e.team_b, club: e.club, everyone: e.everyone, startDate: e.start_date, days: e.days,
  style: e.style, fmt: e.fmt, players: e.players, team: e.team, matches: e.matches, createdBy: e.creator,
  weeks: e.weeks, bestOf: e.best_of, teams: e.league_teams, // leagues
})

/** Events I can see: club events, ones I set up, and ones I'm playing in (RLS decides). */
export async function getEvents() {
  return must(await sb.from('events').select(EVENT_COLS).order('start_date')).map(toEvent)
}

/** Create (no id) or update an event. Returns its id. */
export async function saveEvent(e) {
  const row = {
    name: e.name, team_a: e.A, team_b: e.B, club: !!e.club, everyone: !!e.everyone, start_date: e.startDate, days: e.days,
    style: e.style, fmt: e.fmt, players: e.players, team: e.team, matches: e.matches,
    weeks: e.weeks ?? null, best_of: e.bestOf ?? null, league_teams: e.teams ?? null,
  }
  if (e.id) {
    const rows = must(await sb.from('events').update(row).eq('id', e.id).select('id'))
    if (!rows.length) throw new Error('This event can’t be changed now. It has started, or it isn’t yours.')
    return e.id
  }
  return must(await sb.from('events').insert(row).select('id').single()).id
}

export async function deleteEvent(id) {
  const rows = must(await sb.from('events').delete().eq('id', id).select('id'))
  if (!rows.length) throw new Error('This event can’t be deleted now. It has started, or it isn’t yours.')
}

/** Everyone's cards on some dates (for scoring events): [{ date, lineup, scores, done }]. */
export async function getCardsOn(dates) {
  return must(await sb.from('rounds').select('date, lineup, scores, done, updated_at').in('date', dates).order('updated_at'))
}

/* ---------- Leagues ---------- */

/** League entries: [{ eventId, week, memberId, roundId }] (only leagues I can see). */
export async function getLeagueEntries(eventIds) {
  if (!eventIds.length) return []
  return must(await sb.from('league_entries').select('event_id, week, member_id, round_id').in('event_id', eventIds))
    .map(r => ({ eventId: r.event_id, week: r.week, memberId: r.member_id, roundId: r.round_id }))
}

/** Cards by id: { [id]: { lineup, scores, done } } */
export async function getCardsById(ids) {
  if (!ids.length) return {}
  return Object.fromEntries(must(await sb.from('rounds').select('id, lineup, scores, done').in('id', ids)).map(r => [r.id, r]))
}

/** Enter players on my card into a league this week (before the first hole is saved). Returns the week. */
export async function enterLeague(roundId, eventId, memberIds) {
  return must(await sb.rpc('enter_league', { p_round: roundId, p_event: eventId, p_members: memberIds }))
}

export async function leaveLeague(roundId, eventId, memberIds) {
  must(await sb.rpc('leave_league', { p_round: roundId, p_event: eventId, p_members: memberIds }))
}
