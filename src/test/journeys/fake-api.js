// A pretend TeeMate server for journey tests: an in-memory club (from the sample data) behind the same functions as
// src/api.js, so the real screens run unchanged. It does what the screens need (bookings take spaces, cancelling
// frees them, entries and orders are recorded); the database's own rules are covered by the database tests.
// Anything not covered throws "not faked: <name>", so a gap fails the journey loudly.
import { closesOn } from '../../event-signups.js'
import { COURSE, MEMBERS, GAME_SETTINGS, PIN_SHEET } from '../../sample-data.js'
import { isoDate, addDaysIso } from '../../dates.js'
import { createCache } from '../../api/cache.js'
import { visiblePair } from '../../palette.js'
import { RULES } from '../../api/cache-rules.js'

const copy = x => (x === undefined ? x : JSON.parse(JSON.stringify(x, (k, v) => (v instanceof Set ? undefined : v))))
const ME = 0

/** Every name src/api.js exports (kept in step with it by a test). */
export const API_NAMES = ['getMe', 'forgetMe', 'getSession', 'signIn', 'needsAccount', 'createAccount', 'myRequestPending', 'changePassword', 'signOut',
  'onAuthChange', 'requestAccess', 'getTheme', 'setTheme', 'setDayBoardDays', 'setDayBoardToday', 'setFeePayment', 'getMyBalances', 'setClubName', 'setCourseLocation', 'getHut', 'setHutOn', 'saveHutItem', 'removeHutItem',
  'getHutStaff', 'setHutStaff', 'placeHutOrder', 'cancelMyHutOrder', 'myHutOrders', 'hutOrdersToday', 'setHutOrderStatus', 'getMembers', 'getBuddies',
  'addBuddy', 'removeBuddy', 'getFriends', 'saveContact', 'removeContact', 'setFriendFavourite', 'getAccessList', 'saveMember', 'getFavourites',
  'setFavourite', 'setOfficeLogin', 'getAccessRequests', 'declineRequest', 'deleteMember', 'resetLogin', 'getCourse', 'getPins', 'setGreenWidth', 'publishPins',
  'getTeeSheet', 'bookTeeTime', 'getMyTeeTimes', 'getGuests', 'setGuestHandicap', 'cancelBooking', 'moveMatchBooking', 'adminCancelBooking', 'adminMoveBooking',
  'getBookingNotices', 'seenBookingNotice', 'getMyBookings',
  'getGuestPoints', 'getBookingRules', 'setBookingRules', 'requestTeeTime', 'cancelTeeTimeRequest', 'getMyTeeTimeRequests', 'getTeeTimeRequests',
  'decideTeeTimeRequest', 'markTeeTimeRequestsSeen', 'dismissTeeTimeRequest', 'getGameSettings', 'setMyGamePref', 'getCurrentRound', 'getRound', 'deleteRound', 'saveRound',
  'getTodayRounds', 'getCardsForTeeTimes', 'getMyPlayerEvents', 'proposePlayerEvent', 'proposeSingles', 'counterPlayerEvent', 'answerPlayerEvent', 'cancelPlayerEvent',
  'getStamps', 'getEvents', 'saveEvent', 'saveEvents', 'enterEvent', 'withdrawEvent', 'removeEventEntrant', 'getEventTemplates', 'saveEventTemplate', 'deleteEventTemplate', 'saveSeason', 'deleteEvent', 'getCardsOn', 'getLeagueEntries', 'getCardsById', 'enterLeague', 'leaveLeague', 'enterEventToday',
  'getEventEntries', 'enterEventRound', 'leaveEventRound', 'startLeagueKnockout',
  'getSignups', 'getSignupCounts', 'getSignupDeclines', 'declineSignup', 'undeclineSignup', 'runSignup', 'enterSignup', 'withdrawSignup', 'setMyPlaysIn', 'adminSetPlaysIn', 'saveSignup', 'deleteSignup',
  'getKnockout', 'createMemberKnockout', 'deleteMemberKnockout', 'makeDraw', 'swapDraw', 'setRoundDeadlines', 'setKoRoundHoles', 'publishDraw', 'getKoMatchOfCard', 'linkKoCard', 'reportKoResult', 'confirmKoResult', 'disputeKoResult', 'adminSetKoResult',
  'setPaperCards', 'readScorecard', 'markPaperCard', 'confirmPaperScore', 'sendBackPaperScore', 'resendPaperScore', 'getPaperConfirms', 'uploadCardPhoto', 'cardPhotoUrl', 'removeCardPhotos']

/** For vi.mock('…/api.js'): every export, each calling the current world's version (globalThis.__world). */
export function mockModule() {
  const plain = Object.fromEntries(API_NAMES.map(n => [n, (...a) => {
    const f = globalThis.__world.wrapped[n]
    if (!f) throw new Error(`not faked: ${n}`)
    return f(...a)
  }]))
  // Each world has its own device cache (the real one), as the app's own api.js does.
  const cache = new Proxy({}, { get: (_, k) => (...a) => globalThis.__world.cache[k](...a) })
  return { ...plain, cache }
}

// The pretend reader's answer: two cards, four Score columns (the demo's). Card 1's B column has holes 8 and 18
// hard to read, and its holes 10–18 add up to 43 where the card says 44 (hole 18 was really a 10).
const col = (label, s, out, inn, unsure = []) => ({ label, holes: s.map((score, h) => ({ score, sure: !unsure.includes(h) })), out, in: inn, total: out + inn })
export const PAPER_READING = { parMatches: true, cards: [
  { columns: [col('A', [5,4,3,5,4,5,3,6,6, 5,5,4,5,5,4,4,6,6], 41, 44), col('B', [4,4,4,6,5,5,3,8,5, 4,5,3,5,4,4,4,5,9], 44, 44, [7, 17])] },
  { columns: [col('A', [6,5,3,5,5,6,4,5,7, 5,6,4,5,5,5,4,6,7], 46, 47), col('B', [5,3,4,5,4,5,3,5,8, 4,5,3,5,4,5,3,6,6], 42, 41)] },
] }

const member = id => MEMBERS.find(m => m.id === id)

// As the database's holes_problem: null (all 18), an older match day's number, or a list of holes 1–18, each once.
const holesProblem = h => (h == null || (typeof h === 'number' && [18, 14, 12, 9, 6].includes(h))
  || (Array.isArray(h) && h.length >= 1 && h.every(n => Number.isInteger(n) && n >= 1 && n <= 18) && new Set(h).size === h.length)
  ? null : 'Pick at least one hole, from 1 to 18.')
const takeOff = (e, mid) => {
  e.players = e.players.filter(p => p !== mid)
  if (e.team) delete e.team[mid]
  e.captainPool = (e.captainPool ?? []).filter(p => p !== mid)
  if (e.teams) e.teams = e.teams.map(t => (t.captain === mid ? (({ captain, ...rest }) => rest)(t) : t))
}
// As the real saveEvent's row and the database's checks: points only for four-ball team match play, no empty day
// settings, sign-up only for club events, holes as holes_problem, day settings only for the event's days (weeks).
const tidyEvent = e => {
  holesRefusal(e)
  const units = Math.max(e.days ?? 1, e.weeks ?? 0)
  if (Object.keys(e.dayRules ?? {}).some(d => +d < 1 || +d > units)) throw new Error('Those settings aren’t for a match day in this event.')
  const su = !!e.club && !!e.signup
  return { ...e, points: e.style === 'ryder' ? e.points ?? null : null, dayRules: e.dayRules && Object.keys(e.dayRules).length ? e.dayRules : null,
    signup: su, advertiseFrom: su ? e.advertiseFrom || null : null, entriesClose: su ? e.entriesClose || null : null, maxEntries: su ? e.maxEntries || null : null }
}
const holesRefusal = e => {
  const bad = [e.holes, ...Object.values(e.dayRules ?? {}).map(d => d?.holes)].map(holesProblem).find(Boolean)
  if (bad) throw new Error(bad)
}
const slotTimes = Array.from({ length: 31 }, (_, i) => 480 + i * 10) // 08:00 … 13:00

/**
 * A fresh club. today: 'YYYY-MM-DD' (the fixed test day). setup(db) can change anything before the app starts.
 * db: { slots: { [date]: [slot] }, bookings, rounds, events, entries, leagueEntries, requests, playerEvents, hut, orders, … }
 */
// Who the app is signed in as (journeys run as the person they belong to). Default: Gary, the admin.
export const PEOPLE = {
  admin: { id: 0 }, member: { id: 1 }, organiser: { id: 7 }, captain: { id: 12 }, hut: { id: 10 },
  office: { id: 0, office: true }, newjoiner: { id: 0, signedOut: true }, visitor: { id: 0, signedOut: true },
}
export const NEW_JOINER_EMAIL = 'new.joiner@example.invalid'

export function makeWorld(today, setup = () => {}, as = 'admin') {
  const who = PEOPLE[as] ?? PEOPLE.admin, ME = who.id // the signed-in member (this world's "me")
  let nextId = 5000
  const id = () => nextId++
  const me = () => db.members.find(m => m.id === ME)
  const db = {
    me: ME, today, calls: [],
    stamps: Object.fromEntries(['members', 'course', 'pins', 'games', 'events', 'club', 'comps', 'requests', 'friends', 'templates'].map(k => [k, '1'])),
    members: MEMBERS.map(m => ({ ...m, hutStaff: false, playsIn: [2, 4, 8, 12].includes(m.id) ? 'ladies' : 'men' })),
    signups: [
      { id: 1, name: 'Men’s Match Play', category: 'men', kind: 'singles', closesOn: '2026-10-31', notes: null, open: true },
      { id: 2, name: 'Men’s Fourball', category: 'men', kind: 'pairs', closesOn: '2026-10-31', notes: '£5 a pair', open: true },
      { id: 3, name: 'Ladies Singles', category: 'ladies', kind: 'singles', closesOn: '2026-10-31', notes: null, open: true },
      { id: 4, name: 'Mixed Foursome', category: 'mixed', kind: 'pairs', closesOn: '2026-10-31', notes: null, open: true }],
    eventTemplates: [], // club event templates: { id, name, setup }
    signupEntries: [], koMatches: [], declines: [], // declines: compIds I've said No thanks to
    buddies: [{ id: 1, favourite: false }, { id: 3, favourite: true }, { id: 5, favourite: false }, { id: 7, favourite: false }, { id: 11, favourite: false }],
    contacts: [{ id: 1, name: 'Sam Visitor', club: 'Royal Portrush GC', hcp: '12.0', gui: '1234567', sharedOn: today, favourite: false, updatedAt: `${today}T08:00:00Z` }],
    slots: {}, bookings: [], guestVisits: [], rounds: [], requests: [], playerEvents: [],
    rules: { time: '20:00', days: 8, weekendsOnly: false },
    theme: { main: '#19335A', accent: '#762A43', name: 'Royal Teemate Golf Club', courseLat: 55.2, courseLon: -6.65, coursePlace: 'Portrush', feePayment: 'shop', dayBoardDays: [0, 1, 2, 3, 4, 5, 6], dayBoardToday: null, paperCards: false },
    balances: null, // the club's system once linked: { competition, clubhouse } in pence
    hut: { on: true, menu: [
      { id: 1, section: 'Food', name: 'Bacon roll', pricePence: 450, soldOut: false, sort: 1 },
      { id: 2, section: 'Food', name: 'Toastie', pricePence: 500, soldOut: false, sort: 2 },
      { id: 3, section: 'Drinks', name: 'Tea', pricePence: 250, soldOut: false, sort: 1 }] },
    orders: [], entries: [], leagueEntries: [],
    paperReads: {}, photos: [], // paper scorecards: reads today per member, stored photo paths
    paperReading: PAPER_READING, // what the reader returns (journeys can change it)
    notices: [], // the office changed a booking, or someone booked me in: { id, memberId, kind, date, oldTime, newTime, note, byName?, withNames?, bookingId?, seen }
    joins: [], emails: { 0: 'gary@example.invalid' }, office: null, asOffice: false, pinsToday: false, // club office: asking to join, sign-in emails, the office login
    events: [
      { id: 2, name: 'Winter League', style: 'league', fmt: 'beststab', club: true, everyone: false, startDate: addDaysIso(today, -5), days: 1, weeks: 6, bestOf: 4,
        teams: [{ name: 'Blues', col: '#6f8fd8' }, { name: 'Reds', col: '#c27a8f' }], team: { 0: 0, 1: 0, 3: 1, 5: 1 }, players: [0, 1, 3, 5], captainPool: [],
        matches: {}, selfEntry: false, entryRequired: true, createdBy: { id: 0, name: 'Gary Cochrane' }, A: { name: 'Blues', col: '#6f8fd8' }, B: { name: 'Reds', col: '#c27a8f' } },
      { id: 21, name: 'Saturday Medal', style: 'individual', fmt: 'stab', club: true, everyone: true, startDate: today, days: 1, players: [], team: {}, matches: {},
        selfEntry: true, entryRequired: true, createdBy: { id: 0, name: 'Gary Cochrane' }, A: { name: 'Blues', col: '#6f8fd8' }, B: { name: 'Reds', col: '#c27a8f' } },
      { id: 788, name: 'Christmas Cup', style: 'ryder', fmt: 'bbl', club: false, everyone: false, startDate: today, days: 1, players: [0, 1, 3, 5, 7, 11, 2, 4],
        team: { 0: 'A', 1: 'A', 7: 'A', 11: 'A', 3: 'B', 5: 'B', 2: 'B', 4: 'B' }, matches: { 1: [{ a: [7, 11], b: [2, 4] }, { a: [0, 1], b: [3, 5] }] },
        selfEntry: false, entryRequired: true, createdBy: { id: 0, name: 'Gary Cochrane' }, A: { name: 'Blues', col: '#6f8fd8' }, B: { name: 'Reds', col: '#c27a8f' } },
    ],
  }
  const sheet = date => (db.slots[date] ??= slotTimes.map(t => ({ id: id(), date, time: t, capacity: 4, twilight: false, players: [] })))
  const slotById = sid => Object.values(db.slots).flat().find(s => s.id === sid)
  const days = n => Array.from({ length: n }, (_, i) => addDaysIso(today, i))
  days(14).forEach(sheet)

  // Book: the booker plus members and guests on a tee time (spaces checked). → the booking.
  db.book = (booker, sid, memberIds = [], guests = []) => {
    const s = slotById(sid)
    if (!s) throw new Error('That tee time no longer exists.')
    const n = 1 + memberIds.length + guests.length
    if (s.capacity - s.players.length < n) throw new Error('Sorry, that time has just been taken.')
    const b = { id: id(), slotId: sid, bookedBy: booker }
    db.bookings.push(b)
    for (const m of [booker, ...memberIds]) s.players.push({ id: id(), bookingId: b.id, memberId: m, name: member(m).name, guest: false, hcp: member(m).hcp })
    for (const g of guests) {
      const p = { id: id(), bookingId: b.id, memberId: null, name: g.name, club: g.club ?? '', guest: true, hcp: g.hcp ?? null }
      s.players.push(p); db.guestVisits.push({ member: booker, date: s.date, guest: g.name, club: g.club ?? '', points: 3, playerId: p.id })
    }
    return b
  }
  const unbook = b => { const s = slotById(b.slotId); s.players = s.players.filter(p => p.bookingId !== b.id); db.bookings = db.bookings.filter(x => x !== b) }

  const api = {
    // Signed in as Gary Cochrane (member 0, an admin).
    getMe: async () => (db.signedOut ? null : db.asOffice ? { id: 9000, name: 'Club office', admin: true, office: true, hutStaff: false, playsIn: null }
      : (m => ({ ...member(ME), admin: !!m.admin, hutStaff: !!m.hutStaff, playsIn: m.playsIn, office: false }))(me())), forgetMe: () => {},
    getSession: async () => (db.signedOut ? null : { user: { id: db.session ?? `u${ME}`, email: 'gary@example.invalid' } }), onAuthChange: () => {},
    // Signing in, a first sign-in (an approved email makes its password) and asking to join, as the real auth.js.
    signIn: async (email, password) => {
      const l = db.logins[email.trim().toLowerCase()]
      if (!l || l.password !== password) throw new Error('Wrong email or password. First time here? Create your account instead.')
      db.signedOut = false
    },
    needsAccount: async email => db.approved.includes(email.trim().toLowerCase()) && !db.logins[email.trim().toLowerCase()],
    createAccount: async (email, password) => {
      const e = email.trim().toLowerCase()
      if (db.logins[e]) throw new Error("There's already an account for that email. Sign in instead, or ask the admin to reset your login.")
      if (!db.approved.includes(e)) throw new Error("That email hasn't been given access to TeeMate. Ask the club admin to add you.")
      db.logins[e] = { password, id: null }; db.signedOut = false
    },
    myRequestPending: async () => false,
    requestAccess: async (email, name) => {
      const e = email.trim().toLowerCase()
      if (!e) throw new Error('Enter your email address.')
      if (!name?.trim()) throw new Error('Enter your name.')
      if (db.approved.includes(e)) throw new Error('That email is already approved. Create your account instead.')
      db.joins.push({ id: id(), name: name.trim(), email: e, createdAt: new Date().toISOString() })
    },
    getTheme: async () => ({ ...db.theme }),
    setDayBoardDays: async days => { if (!db.members.find(m => m.id === ME)?.admin && !db.asOffice) throw new Error('Only admins can change the club settings.'); db.theme.dayBoardDays = [...new Set(days)].sort() },
    setDayBoardToday: async on => { if (!db.members.find(m => m.id === ME)?.admin && !db.asOffice) throw new Error('Only admins can change the club settings.'); db.theme.dayBoardToday = on == null ? null : { date: today, on } },
    // Paper scorecards, with the database's rules and messages.
    setPaperCards: async on => { if (!db.members.find(m => m.id === ME)?.admin && !db.asOffice) throw new Error('Only the club office can change this.'); db.theme.paperCards = !!on },
    readScorecard: async ({ images }) => {
      if (!db.theme.paperCards) throw new Error('Paper scorecards are switched off at this club.')
      const n = (db.paperReads[ME] ?? 0)
      if (n >= 10) throw new Error('You’ve read 10 cards today. Enter the scores by hand, or try again tomorrow.')
      db.paperReads[ME] = n + 1
      db.calls.push(['readScorecard', images.length])
      const reading = copy(db.paperReading)
      return { ...reading, cards: reading.cards.slice(0, images.length) }
    },
    markPaperCard: async (rid, photos, confirmer) => {
      const r = db.rounds.find(x => x.id === rid)
      if (!r || !r.lineup.some(x => x.m === ME)) throw new Error('Only players on this card can do that.')
      if (r.paper?.state === 'confirmed') throw new Error('This card’s scores are already confirmed.')
      if (confirmer === ME) throw new Error('Someone else has to confirm your own score.')
      if (confirmer != null && !r.lineup.some(x => x.m === confirmer)) throw new Error('The person confirming your score has to be on this card.')
      r.paper = { by: ME, confirmer: confirmer ?? null, state: 'waiting', note: null, photos: Math.min(2, Math.max(0, photos)) }
    },
    confirmPaperScore: async rid => {
      const r = db.rounds.find(x => x.id === rid), admin = db.asOffice || db.members.find(m => m.id === ME)?.admin
      if (r?.paper?.state !== 'waiting' || !(admin || (r.paper.confirmer === ME && r.lineup.some(x => x.m === ME)))) throw new Error('Only the person asked to confirm this score can confirm it.')
      Object.assign(r.paper, { state: 'confirmed', note: null, confirmer: admin && r.paper.confirmer !== ME ? null : r.paper.confirmer })
    },
    sendBackPaperScore: async (rid, note) => {
      const r = db.rounds.find(x => x.id === rid), admin = db.asOffice || db.members.find(m => m.id === ME)?.admin
      if (r?.paper?.state !== 'waiting' || !(admin || (r.paper.confirmer === ME && r.lineup.some(x => x.m === ME)))) throw new Error('Only the person asked to confirm this score can confirm it.')
      if (!note?.trim()) throw new Error('Add a short note saying what isn’t right.')
      Object.assign(r.paper, { state: 'sent_back', note: note.trim() })
    },
    resendPaperScore: async rid => {
      const r = db.rounds.find(x => x.id === rid)
      if (r?.paper?.by !== ME) throw new Error('Only the player who uploaded the card can send it again.')
      if (r.paper.state !== 'sent_back') throw new Error('This score isn’t waiting to be fixed.')
      r.paper.state = 'waiting'
    },
    getPaperConfirms: async () => {
      const admin = db.asOffice || db.members.find(m => m.id === ME)?.admin
      const forOffice = r => r.paper.confirmer == null || !r.lineup.some(x => x.m === r.paper.confirmer) // nobody asked, or they've left the card
      return copy(db.rounds.filter(r => r.paper?.state === 'waiting' && (forOffice(r) ? admin : r.paper.confirmer === ME))
        .map(r => ({ id: r.id, date: r.date, paperBy: r.paper.by, paperPhotos: r.paper.photos, confirmer: r.paper.confirmer, forOffice: forOffice(r), at: r.updatedAt ?? '',
          lineup: r.lineup, scores: r.scores, game: r.game })))
    },
    uploadCardPhoto: async (rid, n) => { db.photos.push(`${rid}/${n}.jpg`) },
    cardPhotoUrl: async (rid, n) => `data:image/gif;base64,R0lGODlhAQABAAAAACw=#${rid}-${n}`,
    removeCardPhotos: async rid => { db.photos = db.photos.filter(x => !x.startsWith(`${rid}/`)) },
    setTheme: async (main, accent) => { Object.assign(db.theme, { main: main.toUpperCase(), accent: accent.toUpperCase() }) },
    setClubName: async name => { db.theme.name = name.trim() },
    setCourseLocation: async (lat, lon, place) => { Object.assign(db.theme, { courseLat: lat, courseLon: lon, coursePlace: place }) },
    changePassword: async pw => { if (pw.length < 8) throw new Error('Password should be at least 8 characters.'); db.password = pw },
    publishPins: async pins => { db.pinSheet = { setAt: '09:00', setBy: 'Gary Cochrane', pins: copy(pins), date: today }; db.pinsToday = true },
    setGreenWidth: async () => {},
    saveHutItem: async it => { if (it.id) Object.assign(db.hut.menu.find(x => x.id === it.id), it); else db.hut.menu.push({ ...it, id: id() }) },
    removeHutItem: async hid => { db.hut.menu = db.hut.menu.filter(x => x.id !== hid) },
    setGuestHandicap: async (gid, hcp) => { for (const s of Object.values(db.slots).flat()) for (const p of s.players) if (p.id === gid) p.hcp = hcp },
    proposePlayerEvent: async ({ hostSlot, invited, style, format, teamNames = {}, teams = {} }) => {
      const slots = [hostSlot, ...invited].map(slotById)
      const e = { id: id(), date: today, style, format, status: 'pending', proposerSlot: hostSlot, proposedBy: { id: ME, name: member(ME).name }, createdBy: { id: ME, name: member(ME).name },
        teamNames, players: slots.flatMap(s => s.players.map(p => ({ id: p.id, memberId: p.memberId, name: p.name, slot: s.id, team: teams[p.id] ?? null }))),
        groups: slots.map(s => ({ slot: s.id, time: s.time, host: s.id === hostSlot, answer: s.id === hostSlot ? 'accepted' : null })) }
      db.playerEvents.push(e); return e.id
    },
    proposeSingles: async (mySlot, bpId, format) => {
      const mine = slotById(mySlot), theirs = db.slotsOn(today).find(s => s.players.some(p => p.id === bpId)), opp = theirs.players.find(p => p.id === bpId)
      const me = mine.players.find(p => p.memberId === ME)
      const e = { id: id(), date: today, style: 'singles', format, status: 'pending', proposerSlot: mySlot, proposedBy: { id: ME, name: member(ME).name }, createdBy: { id: ME, name: member(ME).name },
        teamNames: { A: me.name, B: opp.name }, players: [{ id: me.id, memberId: ME, name: me.name, slot: mySlot, team: 'A' }, { id: opp.id, memberId: opp.memberId, name: opp.name, slot: theirs.id, team: 'B' }],
        groups: [mine, theirs].sort((a, b) => a.time - b.time).map(s => ({ slot: s.id, time: s.time, host: s.id === mySlot, answer: s.id === mySlot ? 'accepted' : null })) }
      db.playerEvents.push(e); return e.id
    },
    counterPlayerEvent: async (pid, setup) => { Object.assign(db.playerEvents.find(x => x.id === pid), { style: setup.style, format: setup.format }) },
    cancelPlayerEvent: async pid => { Object.assign(db.playerEvents.find(x => x.id === pid), { status: 'cancelled' }) },
    setFeePayment: async p => { db.theme.feePayment = p },
    getMyBalances: async () => copy(db.balances),
    getHut: async () => copy(db.hut),
    getHutStaff: async () => db.members.filter(m => m.hutStaff).map(m => m.id),
    setHutOn: async on => { db.hut.on = on },
    setHutStaff: async (mid, on) => { db.members.find(m => m.id === mid).hutStaff = on },
    placeHutOrder: async (picks, note, roundId = null) => {
      const items = Object.entries(picks).filter(([, q]) => q > 0).map(([i, qty]) => { const m = db.hut.menu.find(x => x.id === +i); return { id: m.id, name: m.name, qty, pricePence: m.pricePence } })
      if (!items.length) throw new Error('Pick something from the menu first.')
      const o = { id: id(), memberId: ME, items, totalPence: items.reduce((t, i) => t + i.qty * i.pricePence, 0), note: note || null, status: 'sent', cancelNote: null, createdAt: new Date().toISOString(), roundId }
      db.orders.push(o); return o.id
    },
    myHutOrders: async () => copy(db.orders.filter(o => o.memberId === ME).reverse()),
    hutOrdersToday: async () => copy(db.orders.map(o => ({ ...o, memberName: member(o.memberId).name, time: null }))),
    cancelMyHutOrder: async oid => { const o = db.orders.find(x => x.id === oid); o.status = 'cancelled'; o.cancelNote = 'Cancelled by you' },
    setHutOrderStatus: async (oid, status, note) => { const o = db.orders.find(x => x.id === oid); o.status = status; if (note) o.cancelNote = note },
    getMembers: async () => copy(db.members),
    getBuddies: async () => db.buddies.map(b => b.id),
    addBuddy: async mid => { if (!db.buddies.some(b => b.id === mid)) db.buddies.push({ id: mid, favourite: false }) },
    removeBuddy: async mid => { db.buddies = db.buddies.filter(b => b.id !== mid) },
    getFriends: async () => copy({ buddies: db.buddies, contacts: db.contacts }),
    saveContact: async (card, cid = null) => {
      const row = { name: card.name, club: card.club ?? null, hcp: card.hcp ?? null, gui: card.gui ?? null, sharedOn: card.sharedOn ?? null, updatedAt: new Date().toISOString() }
      if (cid) Object.assign(db.contacts.find(c => c.id === cid), row); else db.contacts.push({ id: id(), favourite: false, ...row })
    },
    removeContact: async cid => { db.contacts = db.contacts.filter(c => c.id !== cid) },
    setFriendFavourite: async ({ memberId, contactId }, on) => { (memberId != null ? db.buddies.find(b => b.id === memberId) : db.contacts.find(c => c.id === contactId)).favourite = on },
    getAccessRequests: async () => copy(db.joins), getFavourites: async () => [],
    declineRequest: async rid => { db.joins = db.joins.filter(r => r.id !== rid) },
    getAccessList: async () => [...db.members.map(m => ({ id: m.id, name: m.name, gui: m.gui, hcp: m.hcp, email: db.emails[m.id] ?? null, admin: !!m.admin, office: false, signedIn: m.id === 0 || !!m.signedIn })),
      ...(db.office ? [{ id: 9000, name: 'Club office', gui: null, hcp: 54, email: db.office, admin: true, office: true, signedIn: false }] : [])],
    saveMember: async m => {
      let row = db.members.find(x => x.id === m.id)
      if (!row) { row = { id: id(), name: m.name, gui: null, hcp: m.hcp, admin: false, hutStaff: false, playsIn: null }; db.members.push(row) }
      Object.assign(row, { name: m.name.trim(), admin: !!m.admin })
      if (m.email) db.emails[row.id] = m.email.toLowerCase(); else delete db.emails[row.id]
      db.joins = db.joins.filter(r => r.email !== m.email)
      return row.id
    },
    adminSetPlaysIn: async (mid, p) => { db.members.find(m => m.id === mid).playsIn = p },
    setOfficeLogin: async email => { db.office = email || null },
    deleteMember: async mid => { db.members = db.members.filter(m => m.id !== mid) },
    resetLogin: async () => {},
    getCourse: async () => ({ ...copy(COURSE), guestPoints: 3 }),
    getPins: async () => (db.pinSheet ? copy(db.pinSheet) : { ...copy(PIN_SHEET), date: db.pinsToday ? today : '2026-10-01' }),
    getGameSettings: async () => ({ ...copy(GAME_SETTINGS), mine: {} }),
    setMyGamePref: async () => {},
    getTeeSheet: async date => copy(sheet(date).map(s => ({ ...s, players: s.players.map(p => ({ ...p, bookedBy: db.bookings.find(b => b.id === p.bookingId)?.bookedBy })) }))),
    adminCancelBooking: async (bid, note = '') => {
      const b = db.bookings.find(x => x.id === bid), s = slotById(b.slotId), ids = s.players.filter(p => p.bookingId === bid && !p.guest).map(p => p.memberId)
      unbook(b)
      ids.forEach(m => db.notices.push({ id: id(), memberId: m, kind: 'cancelled', date: s.date, oldTime: s.time, newTime: null, note: note || null, seen: false }))
      return { told: ids.length }
    },
    adminMoveBooking: async (bid, sid, note = '') => {
      const b = db.bookings.find(x => x.id === bid), s = slotById(b.slotId), to = slotById(sid), mine = s.players.filter(p => p.bookingId === bid)
      if (to.capacity - to.players.length < mine.length) throw new Error('Sorry, those spaces have just been taken. Pick another time.')
      unbook(b)
      const ids = mine.filter(p => !p.guest).map(p => p.memberId)
      db.book(b.bookedBy, sid, ids.filter(m => m !== b.bookedBy), mine.filter(p => p.guest).map(p => ({ name: p.name, club: p.club, hcp: p.hcp })))
      ids.forEach(m => db.notices.push({ id: id(), memberId: m, kind: 'moved', date: to.date, oldTime: s.time, newTime: to.time, note: note || null, seen: false }))
    },
    getBookingNotices: async () => copy(db.notices.filter(n => n.memberId === ME && !n.seen && (n.kind !== 'added' || db.bookings.some(b => b.id === n.bookingId)))),
    seenBookingNotice: async nid => { const n = db.notices.find(x => x.id === nid); if (n?.memberId === ME) n.seen = true },
    getMyTeeTimes: async date => copy(sheet(isoDate(date)).filter(s => s.players.some(p => p.memberId === ME))),
    bookTeeTime: async ({ slotId, memberIds = [], guests = [] }) => {
      const b = db.book(ME, slotId, memberIds, guests), s = slotById(slotId)
      const on = s.players.filter(p => p.bookingId === b.id) // as the database: everyone else on it is told who booked them in
      on.filter(p => p.memberId != null && p.memberId !== ME).forEach(p => db.notices.push({ id: id(), memberId: p.memberId, kind: 'added', date: s.date, oldTime: s.time,
        newTime: null, note: null, byName: member(ME).name, withNames: on.filter(o => o !== p).map(o => o.name.split(' ')[0]), bookingId: b.id, seen: false }))
      return { id: b.id, date: s.date, time: s.time, players: s.players.filter(p => p.bookingId === b.id).map(p => p.name), guests: guests.length, pointsUsed: guests.length * 3 }
    },
    getGuests: async ids => Object.values(db.slots).flat().flatMap(s => s.players).filter(p => p.guest && ids.includes(p.id)).map(p => ({ id: p.id, name: p.name, club: p.club, hcp: p.hcp })),
    getMyBookings: async () => db.bookings.map(b => ({ b, s: slotById(b.slotId) }))
      .filter(({ s }) => s.date >= today && s.players.some(p => p.memberId === ME))
      .map(({ b, s }) => {
        const ids = s.players.filter(p => p.bookingId === b.id && p.memberId != null).map(p => p.memberId)
        const card = db.rounds.find(r => r.slotId === s.id && r.date === s.date && r.lineup.some(x => ids.includes(x.m)))
        return { id: b.id, date: s.date, time: s.time, mine: b.bookedBy === ME, bookedBy: member(b.bookedBy).name, guests: s.players.filter(p => p.bookingId === b.id && p.guest).length,
          players: s.players.length, scoredHoles: card ? card.done.filter(Boolean).length : 0,
          people: s.players.map(p => ({ memberId: p.memberId, name: p.name, guest: p.guest, club: p.club, hcp: p.hcp, inBooking: p.bookingId === b.id })) }
      }).sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time)),
    cancelBooking: async (bid, removeScores = false) => {
      const b = db.bookings.find(x => x.id === bid), s = slotById(b.slotId)
      const gone = s.players.filter(p => p.bookingId === b.id && p.memberId != null).map(p => p.memberId)
      unbook(b)
      const before = db.rounds.length
      db.rounds = db.rounds.filter(r => !(r.slotId === s.id && r.lineup.some(x => gone.includes(x.m)) && (removeScores || !r.done.some(Boolean))))
      return { result: 'deleted', pointsBack: 0, cardsRemoved: before - db.rounds.length, eventsCancelled: 0 }
    },
    moveMatchBooking: async (bid, sid) => {
      const b = db.bookings.find(x => x.id === bid), s = slotById(b.slotId)
      const ids = s.players.filter(p => p.bookingId === b.id).map(p => p.memberId)
      if (slotById(sid).capacity - slotById(sid).players.length < ids.length) throw new Error('Sorry, that time has just been taken.')
      unbook(b)
      return db.book(b.bookedBy, sid, ids.filter(m => m !== b.bookedBy))
    },
    getGuestPoints: async () => ({ allowance: 36, cost: 3, course: 'Ailsa',
      mine: db.guestVisits.filter(v => v.member === ME).map(v => ({ date: v.date, guest: v.guest, club: v.club, course: 'Ailsa', points: v.points })),
      members: db.members.map(m => ({ id: m.id, name: m.name, used: db.guestVisits.filter(v => v.member === m.id).reduce((t, v) => t + v.points, 0) })) }),
    getBookingRules: async () => ({ ...db.rules, now: new Date() }),
    setBookingRules: async ({ time, days, weekendsOnly }) => {
      if (!db.asOffice && !db.members.find(m => m.id === ME)?.admin) throw new Error('Only admins can change the booking rules.')
      if (!(days >= 1 && days <= 13)) throw new Error('Days ahead must be between 1 and 13.')
      db.rules = { ...db.rules, time, days, weekendsOnly: !!weekendsOnly }
    },
    requestTeeTime: async ({ slotId, memberIds = [], guests = [], reason }) => {
      const s = slotById(slotId), r = { id: id(), memberId: ME, slotId, date: s.date, time: s.time, memberIds, guests, reason, status: 'pending', note: null, decidedAt: null, seen: false, createdAt: new Date().toISOString() }
      db.requests.unshift(r); return r.id
    },
    cancelTeeTimeRequest: async rid => { db.requests.find(r => r.id === rid).status = 'cancelled' },
    getMyTeeTimeRequests: async () => copy(db.requests.filter(r => r.memberId === ME && !r.dismissed)),
    dismissTeeTimeRequest: async rid => { db.requests.find(r => r.id === rid).dismissed = true },
    getTeeTimeRequests: async () => copy(db.requests),
    decideTeeTimeRequest: async (rid, approve, note = null) => {
      const r = db.requests.find(x => x.id === rid)
      if (approve) { const b = db.book(r.memberId, r.slotId, r.memberIds, r.guests); Object.assign(r, { status: 'approved', bookingId: b.id }) } else Object.assign(r, { status: 'declined', note })
      r.seen = false
    },
    markTeeTimeRequestsSeen: async () => { db.requests.forEach(r => { if (r.status !== 'pending') r.seen = true }) },
    // Cards: stored as the app gives them (my view; I'm always first on cards I start).
    getCurrentRound: async () => copy([...db.rounds].reverse().find(r => r.date === today && r.lineup.some(x => x.m === ME)) ?? null),
    getRound: async rid => copy(db.rounds.find(r => r.id === rid) ?? null),
    saveRound: async round => {
      if (!round.id && round.slotId != null) {
        const theirs = db.rounds.find(r => r.slotId === round.slotId && r.date === today && !r.submitted?.[r.game])
        if (theirs) round.id = theirs.id
      }
      if (!round.id) Object.assign(round, { id: id(), createdBy: ME })
      round.updatedAt = new Date().toISOString(); round.changed = new Set()
      const row = { ...copy(round), date: today, paper: db.rounds.find(r => r.id === round.id)?.paper ?? null } // as the database: only the paper steps change it
      db.rounds = [...db.rounds.filter(r => r.id !== round.id), row]
    },
    deleteRound: async rid => { db.rounds = db.rounds.filter(r => r.id !== rid); db.photos = db.photos.filter(x => !x.startsWith(`${rid}/`)) },
    getTodayRounds: async () => [],
    getCardsForTeeTimes: async () => ({}),
    getMyPlayerEvents: async () => copy(db.playerEvents),
    answerPlayerEvent: async (pid, accept) => {
      const e = db.playerEvents.find(x => x.id === pid), mine = e.players.find(p => p.memberId === ME)?.slot
      e.groups.find(g => g.slot === mine).answer = accept ? 'accepted' : 'declined'
      e.status = accept ? 'accepted' : 'cancelled'
    },
    getStamps: async () => ({ ...db.stamps }),
    // As the real api/events.js: team colours visible on navy and never the same.
    deleteEvent: async eid => { db.events = db.events.filter(e => e.id !== eid) },
    getEvents: async () => copy(db.events).map(e => { const [a, b] = visiblePair(e.A?.col, e.B?.col); return { ...e, A: e.A && { ...e.A, col: a }, B: e.B && { ...e.B, col: b } } }),
    getCardsOn: async dates => copy(db.rounds.filter(r => dates.includes(r.date))),
    getCardsById: async ids => Object.fromEntries(db.rounds.filter(r => ids.includes(r.id)).map(r => [r.id, copy(r)])),
    getLeagueEntries: async eids => copy(db.leagueEntries.filter(x => eids.includes(x.eventId))),
    getEventEntries: async eids => copy(db.entries.filter(x => eids.includes(x.eventId))),
    leaveLeague: async (rid, eid, ids) => {
      const r = db.rounds.find(x => x.id === rid)
      if (!r || !r.lineup.some(x => x.m === ME)) throw new Error('You can only change entries on a card you\'re on.')
      if (r.done.some(Boolean)) throw new Error('Entries are locked once the first hole is saved.')
      db.leagueEntries = db.leagueEntries.filter(x => !(x.eventId === eid && x.roundId === rid && ids.includes(x.memberId)))
    },
    enterLeague: async (rid, eid, ids, marker = null) => { ids.forEach(m => db.leagueEntries.push({ eventId: eid, week: 1, memberId: m, roundId: rid, marker })); return 1 },
    enterEventRound: async (rid, eid, ids, marker = null) => { ids.forEach(m => db.entries.push({ eventId: eid, day: 1, memberId: m, roundId: rid, marker })); return 1 },
    // As the database's rules: a member sees their own entries; admins see everyone's.
    getSignups: async () => copy({ comps: db.signups, entries: me().admin ? db.signupEntries : db.signupEntries.filter(e => e.memberId === ME || e.partnerId === ME) }),
    saveSignup: async c => { if (c.id) Object.assign(db.signups.find(x => x.id === c.id), c); else db.signups.push({ ...c, id: id(), drawPublished: false, roundDeadlines: [] }) },
    deleteSignup: async cid => { db.signups = db.signups.filter(c => c.id !== cid) },
    getSignupCounts: async () => Object.fromEntries(db.signups.map(c => [c.id, db.signupEntries.filter(e => e.compId === c.id).length])),
    enterSignup: async (cid, partnerId = null) => {
      // As the real enter_signup: nobody in two entries of one competition.
      const taken = id => db.signupEntries.some(e => e.compId === cid && (e.memberId === id || e.partnerId === id))
      const c = db.signups.find(x => x.id === cid)
      if (taken(ME)) throw new Error(`You’re already entered in ${c.name}.`)
      if (partnerId != null && taken(partnerId)) throw new Error(`${member(partnerId).name} is already entered in ${c.name}. Pick another partner.`)
      db.signupEntries.push({ compId: cid, memberId: ME, partnerId })
    },
    withdrawSignup: async cid => { db.signupEntries = db.signupEntries.filter(e => !(e.compId === cid && (e.memberId === ME || e.partnerId === ME))) },
    setMyPlaysIn: async p => { me().playsIn = p },
    createMemberKnockout: async (name, kind, entries, deadlines) => {
      const cid = id(); db.signups.push({ id: cid, name, category: 'open', kind, closesOn: db.today, notes: null, open: false, drawPublished: true, roundDeadlines: deadlines, maxEntries: null, createdBy: ME })
      const es = entries.map(e => ({ id: id(), compId: cid, memberId: e[0], partnerId: e[1] ?? null })); db.signupEntries.push(...es)
      const size = 2 ** Math.ceil(Math.log2(es.length)), half = size / 2
      for (let k = 0; k < half; k++) db.koMatches.push({ id: id(), compId: cid, round: 1, slot: k, aEntry: es[k].id, bEntry: es[half + k]?.id ?? null, winnerEntry: es[half + k] ? null : es[k].id, result: null, status: es[half + k] ? 'open' : 'bye', reportedEntry: null })
      for (let r = 2; 2 ** r <= size; r++) for (let k = 0; k < size / 2 ** r; k++) db.koMatches.push({ id: id(), compId: cid, round: r, slot: k, aEntry: null, bEntry: null, winnerEntry: null, result: null, status: 'open', reportedEntry: null })
      db.koMatches.filter(m => m.compId === cid && m.status === 'bye').forEach(db.koAdvance)
      return cid
    },
    deleteMemberKnockout: async cid => { db.signups = db.signups.filter(c => c.id !== cid); db.koMatches = db.koMatches.filter(m => m.compId !== cid) },
    getKnockout: async cid => copy({ matches: db.koMatches.filter(m => m.compId === cid), entries: db.signupEntries.filter(e => e.compId === cid) }),
    getSignupDeclines: async () => [...db.declines],
    declineSignup: async cid => { if (!db.declines.includes(cid)) db.declines.push(cid) },
    undeclineSignup: async cid => { db.declines = db.declines.filter(x => x !== cid) },
    runSignup: async (cid, { closesOn, finalBy, maxEntries = null, notes = '', fee = null }) => {
      db.koMatches = db.koMatches.filter(m => m.compId !== cid); db.signupEntries = db.signupEntries.filter(e => e.compId !== cid); db.declines = db.declines.filter(x => x !== cid)
      Object.assign(db.signups.find(c => c.id === cid), { open: true, closesOn, finalBy, maxEntries: maxEntries ? +maxEntries : null, notes: notes || null, drawPublished: false, roundDeadlines: [], entryFee: fee || null })
    },
    getKoMatchOfCard: async rid => { const m = db.koMatches.find(x => x.roundId === rid); return m ? { compId: m.compId, round: m.round } : null },
    linkKoCard: async (mid, rid) => { db.koMatches.find(m => m.id === mid).roundId = rid },
    reportKoResult: async (mid, w, r) => Object.assign(db.koMatches.find(m => m.id === mid), { status: 'reported', winnerEntry: w, result: r, reportedEntry: db.signupEntries.find(e => e.memberId === ME || e.partnerId === ME)?.id }),
    confirmKoResult: async mid => { const m = db.koMatches.find(x => x.id === mid); m.status = 'confirmed'; db.koAdvance(m) },
    disputeKoResult: async mid => { db.koMatches.find(m => m.id === mid).status = 'disputed' },
    // The draw, with the database's rules (admin_make_draw, admin_publish_draw, admin_swap_draw, admin_set_round_deadlines).
    makeDraw: async cid => {
      if (!db.asOffice && !db.members.find(m => m.id === ME)?.admin) throw new Error('Only admins can make the draw.')
      const c = db.signups.find(x => x.id === cid)
      if (!c) throw new Error('That competition no longer exists.')
      if (c.drawPublished) throw new Error('The draw is already published.')
      const ents = db.signupEntries.filter(e => e.compId === cid).map(e => e.id)
      if (ents.length < 2) throw new Error('A draw needs at least two entries.')
      const rounds = Math.ceil(Math.log2(ents.length)), size = 2 ** rounds
      db.koMatches = db.koMatches.filter(m => m.compId !== cid)
      for (let r = 1; r <= rounds; r++) for (let k = 0; k < size / 2 ** r; k++) {
        const a = r === 1 ? ents[2 * k] ?? null : null, b = r === 1 ? ents[2 * k + 1] ?? null : null, bye = r === 1 && a != null && b == null
        db.koMatches.push({ id: id(), compId: cid, round: r, slot: k, aEntry: a, bEntry: b, winnerEntry: bye ? a : null, result: null, status: bye ? 'bye' : 'open', reportedEntry: null })
      }
      db.koMatches.filter(m => m.compId === cid && m.status === 'bye').forEach(db.koAdvance)
    },
    publishDraw: async cid => {
      if (!db.asOffice && !db.members.find(m => m.id === ME)?.admin) throw new Error('Only admins can publish the draw.')
      if (!db.koMatches.some(m => m.compId === cid)) throw new Error('Make the draw first.')
      db.signups.find(x => x.id === cid).drawPublished = true
    },
    swapDraw: async (cid, x, y) => {
      if (!db.asOffice && !db.members.find(m => m.id === ME)?.admin) throw new Error('Only admins can change the draw.')
      if (db.signups.find(c => c.id === cid)?.drawPublished) throw new Error('The draw is published.')
      for (const m of db.koMatches.filter(m => m.compId === cid && m.round === 1)) for (const k of ['aEntry', 'bEntry']) m[k] = m[k] === x ? y : m[k] === y ? x : m[k]
    },
    setRoundDeadlines: async (cid, dates) => {
      if (!db.asOffice && !db.members.find(m => m.id === ME)?.admin) throw new Error('Only admins can set the dates.')
      db.signups.find(c => c.id === cid).roundDeadlines = [...dates]
    },
    adminSetKoResult: async (mid, w, r) => { const m = db.koMatches.find(x => x.id === mid); Object.assign(m, { status: 'confirmed', winnerEntry: w, result: r }); db.koAdvance(m) },
    saveSeason: async e => { const x = db.events.find(y => y.id === e.id); Object.assign(x, copy({ days: e.days, team: e.team, players: Object.keys(e.team).map(Number), matches: e.matches, dayRules: e.dayRules ?? x.dayRules ?? null })) },
    // As the real saveEvent: points only for four-ball team match play; holes checked as the database does.
    saveEvent: async e => { e = tidyEvent(e); if (e.id) Object.assign(db.events.find(x => x.id === e.id), copy(e)); else db.events.push({ ...copy(e), id: id(), createdBy: { id: ME, name: 'Gary Cochrane' } }); return e.id ?? db.events.at(-1).id },
    saveEvents: async list => { list = list.map(tidyEvent); return list.map(e => { const n = { ...copy(e), id: id(), createdBy: { id: ME, name: 'Gary Cochrane' } }; db.events.push(n); return n.id }) },
    // As the database's enter_event / withdraw_event / remove_event_entrant (sign-ups: dates and places).
    enterEvent: async eid => {
      const e = db.events.find(x => x.id === eid)
      if (!e?.club || !(e.selfEntry || e.signup)) throw new Error('This competition isn’t open for entry. Ask an admin to add you.')
      if (!e.signup && e.startDate <= db.today) throw new Error('This competition has started, so entries are closed.')
      if (e.players.includes(ME)) return
      if (e.signup) {
        if (e.advertiseFrom && db.today < e.advertiseFrom) throw new Error(`Entries open on ${e.advertiseFrom}.`)
        if (db.today > closesOn(e)) throw new Error('Entries have closed.')
        if (e.maxEntries != null && e.players.length >= e.maxEntries) throw new Error('Sorry, it’s full: someone took the last place.')
      }
      e.players.push(ME)
    },
    withdrawEvent: async eid => {
      const e = db.events.find(x => x.id === eid)
      if (e.signup && db.today > closesOn(e)) throw new Error('Entries have closed. Ask the club office to take you off.')
      if (!e.signup && e.startDate <= db.today) throw new Error('This competition has started. Ask an admin to take you off.')
      takeOff(e, ME)
    },
    removeEventEntrant: async (eid, mid) => {
      if (!db.members.find(m => m.id === ME)?.admin) throw new Error('Only the club office can take someone off.')
      takeOff(db.events.find(x => x.id === eid), mid)
    },
    getEventTemplates: async () => { if (!db.members.find(m => m.id === ME)?.admin) return []; return copy(db.eventTemplates).sort((a, b) => a.name.localeCompare(b.name)) },
    saveEventTemplate: async ({ id: tid, name, setup }) => {
      if (!db.members.find(m => m.id === ME)?.admin) throw new Error('new row violates row-level security policy for table "event_templates"')
      if (tid) { Object.assign(db.eventTemplates.find(t => t.id === tid), copy({ name, setup })); return tid }
      const n = { id: id(), name, setup: copy(setup) }; db.eventTemplates.push(n); return n.id
    },
    deleteEventTemplate: async tid => { db.eventTemplates = db.eventTemplates.filter(t => t.id !== tid) },
    setKoRoundHoles: async (cid, round, holes) => {
      const c = db.signups.find(x => x.id === cid)
      if (!c) throw new Error('That knockout no longer exists.')
      if (!db.members.find(m => m.id === ME)?.admin && c.createdBy !== ME) throw new Error('Only the knockout’s organiser (or an admin) sets its holes.')
      const rounds = Math.max(0, ...db.koMatches.filter(m => m.compId === cid).map(m => m.round)) || 10
      if (!(round >= 1 && round <= rounds)) throw new Error('That isn’t a round of this knockout.')
      if (holesProblem(holes)) throw new Error(holesProblem(holes))
      const rh = { ...(c.roundHoles ?? {}) }
      if (holes == null) delete rh[round]; else rh[round] = [...holes]
      c.roundHoles = rh
    },
    startLeagueKnockout: async (eid, seeds, deadlines) => {
      const ev = db.events.find(x => x.id === eid)
      const cid = await api.createMemberKnockout(`${ev.name} knockout`, seeds[0].length === 2 ? 'pairs' : 'singles', seeds, deadlines)
      ev.koComp = cid; return cid
    },
    enterEventToday: async (rid, eid, marker) => {
      const e = db.events.find(x => x.id === eid)
      if (!e.players.includes(ME)) e.players.push(ME)
      db.entries.push({ eventId: eid, day: 1, memberId: ME, roundId: rid, marker }); return 1
    },
  }
  // Record every call (journeys check what reached the server).
  // Refusal on demand (journey tests): db.refuse = { [action]: message } makes that call fail once, before it changes anything.
  for (const [k, f] of Object.entries(api)) api[k] = (...a) => {
    db.calls.push(k)
    if (db.refuse?.[k]) { const m = db.refuse[k]; delete db.refuse[k]; return Promise.reject(new Error(m)) }
    return f(...a)
  }
  db.slotsOn = sheet
  db.koAdvance = m => { const n = db.koMatches.find(x => x.compId === m.compId && x.round === m.round + 1 && x.slot === Math.floor(m.slot / 2)); if (n) n[m.slot % 2 ? 'bEntry' : 'aEntry'] = m.winnerEntry }
  // The person: hut staff, a league captain, the office, or signed out (a new joiner has an approved email).
  if (as === 'hut') db.members.find(m => m.id === ME).hutStaff = true
  if (as === 'captain') db.events.find(e => e.name === 'Winter League').teams[0].captain = ME
  if (who.office) db.asOffice = true
  db.signedOut = !!who.signedOut
  db.logins = { 'gary@example.invalid': { password: 'correct horse', id: 0 } } // email → { password, member id }
  db.approved = as === 'newjoiner' ? [NEW_JOINER_EMAIL] : []
  setup(db, { sheet, slotById, id })
  // The real device cache in front of the pretend server, with a pretend storage that lives as long as the world.
  const kept = new Map(), storage = { getItem: k => kept.get(k) ?? null, setItem: (k, v) => kept.set(k, v), removeItem: k => kept.delete(k) }
  const cache = createCache({ storage, getStamps: () => api.getStamps() })
  return { api, db, cache, wrapped: cache.wrap(api, RULES) }
}
