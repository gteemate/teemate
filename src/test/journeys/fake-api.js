// A pretend TeeMate server for journey tests: an in-memory club (from the sample data) behind the same functions as
// src/api.js, so the real screens run unchanged. It does what the screens need (bookings take spaces, cancelling
// frees them, entries and orders are recorded); the database's own rules are covered by the database tests.
// Anything not covered throws "not faked: <name>", so a gap fails the journey loudly.
import { COURSE, MEMBERS, GAME_SETTINGS, PIN_SHEET } from '../../sample-data.js'
import { isoDate, addDaysIso } from '../../dates.js'

const copy = x => (x === undefined ? x : JSON.parse(JSON.stringify(x, (k, v) => (v instanceof Set ? undefined : v))))
const ME = 0

/** Every name src/api.js exports (kept in step with it by a test). */
export const API_NAMES = ['getMe', 'forgetMe', 'getSession', 'signIn', 'needsAccount', 'createAccount', 'myRequestPending', 'changePassword', 'signOut',
  'onAuthChange', 'requestAccess', 'getTheme', 'setTheme', 'setClubName', 'setCourseLocation', 'getHut', 'setHutOn', 'saveHutItem', 'removeHutItem',
  'getHutStaff', 'setHutStaff', 'placeHutOrder', 'cancelMyHutOrder', 'myHutOrders', 'hutOrdersToday', 'setHutOrderStatus', 'getMembers', 'getBuddies',
  'addBuddy', 'removeBuddy', 'getFriends', 'saveContact', 'removeContact', 'setFriendFavourite', 'getAccessList', 'saveMember', 'getFavourites',
  'setFavourite', 'getAccessRequests', 'declineRequest', 'deleteMember', 'resetLogin', 'getCourse', 'getPins', 'setGreenWidth', 'publishPins',
  'getTeeSheet', 'bookTeeTime', 'getMyTeeTimes', 'getGuests', 'setGuestHandicap', 'cancelBooking', 'moveMatchBooking', 'getMyBookings',
  'getGuestPoints', 'getBookingRules', 'setBookingRules', 'requestTeeTime', 'cancelTeeTimeRequest', 'getMyTeeTimeRequests', 'getTeeTimeRequests',
  'decideTeeTimeRequest', 'markTeeTimeRequestsSeen', 'dismissTeeTimeRequest', 'getGameSettings', 'setMyGamePref', 'getCurrentRound', 'getRound', 'deleteRound', 'saveRound',
  'getTodayRounds', 'getCardsForTeeTimes', 'getMyPlayerEvents', 'proposePlayerEvent', 'counterPlayerEvent', 'answerPlayerEvent', 'cancelPlayerEvent',
  'getEvents', 'saveEvent', 'deleteEvent', 'getCardsOn', 'getLeagueEntries', 'getCardsById', 'enterLeague', 'leaveLeague', 'enterEventToday',
  'getEventEntries', 'enterEventRound', 'leaveEventRound', 'startLeagueKnockout',
  'getSignups', 'getSignupCounts', 'enterSignup', 'withdrawSignup', 'setMyPlaysIn', 'adminSetPlaysIn', 'saveSignup', 'deleteSignup',
  'getKnockout', 'createMemberKnockout', 'deleteMemberKnockout', 'makeDraw', 'swapDraw', 'setRoundDeadlines', 'publishDraw', 'reportKoResult', 'confirmKoResult', 'disputeKoResult', 'adminSetKoResult']

/** For vi.mock('…/api.js'): every export, each calling the current world's version (globalThis.__world). */
export function mockModule() {
  return Object.fromEntries(API_NAMES.map(n => [n, (...a) => {
    const f = globalThis.__world.api[n]
    if (!f) throw new Error(`not faked: ${n}`)
    return f(...a)
  }]))
}

const member = id => MEMBERS.find(m => m.id === id)
const slotTimes = Array.from({ length: 31 }, (_, i) => 480 + i * 10) // 08:00 … 13:00

/**
 * A fresh club. today: 'YYYY-MM-DD' (the fixed test day). setup(db) can change anything before the app starts.
 * db: { slots: { [date]: [slot] }, bookings, rounds, events, entries, leagueEntries, requests, playerEvents, hut, orders, … }
 */
export function makeWorld(today, setup = () => {}) {
  let nextId = 5000
  const id = () => nextId++
  const db = {
    me: ME, today, calls: [],
    members: MEMBERS.map(m => ({ ...m, hutStaff: false, playsIn: [2, 4, 8, 12].includes(m.id) ? 'ladies' : 'men' })),
    signups: [
      { id: 1, name: 'Men’s Match Play', category: 'men', kind: 'singles', closesOn: '2026-10-31', notes: null, open: true },
      { id: 2, name: 'Men’s Fourball', category: 'men', kind: 'pairs', closesOn: '2026-10-31', notes: '£5 a pair', open: true },
      { id: 3, name: 'Ladies Singles', category: 'ladies', kind: 'singles', closesOn: '2026-10-31', notes: null, open: true },
      { id: 4, name: 'Mixed Foursome', category: 'mixed', kind: 'pairs', closesOn: '2026-10-31', notes: null, open: true }],
    signupEntries: [], koMatches: [],
    buddies: [{ id: 1, favourite: false }, { id: 3, favourite: true }, { id: 5, favourite: false }, { id: 7, favourite: false }, { id: 11, favourite: false }],
    contacts: [{ id: 1, name: 'Sam Visitor', club: 'Royal Portrush GC', hcp: '12.0', gui: '1234567', sharedOn: today, favourite: false, updatedAt: `${today}T08:00:00Z` }],
    slots: {}, bookings: [], guestVisits: [], rounds: [], requests: [], playerEvents: [],
    rules: { time: '20:00', days: 8, weekendsOnly: false },
    theme: { main: '#19335A', accent: '#762A43', name: 'Royal Teemate Golf Club', courseLat: 55.2, courseLon: -6.65, coursePlace: 'Portrush' },
    hut: { on: true, menu: [
      { id: 1, section: 'Food', name: 'Bacon roll', pricePence: 450, soldOut: false, sort: 1 },
      { id: 2, section: 'Food', name: 'Toastie', pricePence: 500, soldOut: false, sort: 2 },
      { id: 3, section: 'Drinks', name: 'Tea', pricePence: 250, soldOut: false, sort: 1 }] },
    orders: [], entries: [], leagueEntries: [],
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
    getMe: async () => ({ ...member(ME), hutStaff: db.members[0].hutStaff, playsIn: db.members[0].playsIn }), forgetMe: () => {},
    getSession: async () => ({ user: { id: 'u0', email: 'gary@example.invalid' } }), onAuthChange: () => {},
    myRequestPending: async () => false,
    getTheme: async () => ({ ...db.theme }),
    getHut: async () => copy(db.hut),
    getHutStaff: async () => db.members.filter(m => m.hutStaff).map(m => m.id),
    setHutOn: async on => { db.hut.on = on },
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
    getAccessRequests: async () => [], getFavourites: async () => [],
    getAccessList: async () => db.members.map(m => ({ id: m.id, name: m.name, gui: m.gui, hcp: m.hcp, email: m.id === 0 ? 'gary@example.invalid' : null, admin: !!m.admin, signedIn: m.id === 0 })),
    getCourse: async () => ({ ...copy(COURSE), guestPoints: 3 }),
    getPins: async () => copy(PIN_SHEET),
    getGameSettings: async () => ({ ...copy(GAME_SETTINGS), mine: {} }),
    setMyGamePref: async () => {},
    getTeeSheet: async date => copy(sheet(date)),
    getMyTeeTimes: async date => copy(sheet(isoDate(date)).filter(s => s.players.some(p => p.memberId === ME))),
    bookTeeTime: async ({ slotId, memberIds = [], guests = [] }) => {
      const b = db.book(ME, slotId, memberIds, guests), s = slotById(slotId)
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
    requestTeeTime: async ({ slotId, memberIds = [], guests = [], reason }) => {
      const s = slotById(slotId), r = { id: id(), memberId: ME, slotId, date: s.date, time: s.time, memberIds, guests, reason, status: 'pending', note: null, decidedAt: null, seen: false, createdAt: new Date().toISOString() }
      db.requests.unshift(r); return r.id
    },
    cancelTeeTimeRequest: async rid => { db.requests.find(r => r.id === rid).status = 'cancelled' },
    getMyTeeTimeRequests: async () => copy(db.requests.filter(r => r.memberId === ME && !r.dismissed)),
    dismissTeeTimeRequest: async rid => { db.requests.find(r => r.id === rid).dismissed = true },
    getTeeTimeRequests: async () => copy(db.requests),
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
      const row = { ...copy(round), date: today }
      db.rounds = [...db.rounds.filter(r => r.id !== round.id), row]
    },
    deleteRound: async rid => { db.rounds = db.rounds.filter(r => r.id !== rid) },
    getTodayRounds: async () => [],
    getCardsForTeeTimes: async () => ({}),
    getMyPlayerEvents: async () => copy(db.playerEvents),
    answerPlayerEvent: async (pid, accept) => {
      const e = db.playerEvents.find(x => x.id === pid), mine = e.players.find(p => p.memberId === ME)?.slot
      e.groups.find(g => g.slot === mine).answer = accept ? 'accepted' : 'declined'
      e.status = accept ? 'accepted' : 'cancelled'
    },
    getEvents: async () => copy(db.events),
    getCardsOn: async dates => copy(db.rounds.filter(r => dates.includes(r.date))),
    getCardsById: async ids => Object.fromEntries(db.rounds.filter(r => ids.includes(r.id)).map(r => [r.id, copy(r)])),
    getLeagueEntries: async eids => copy(db.leagueEntries.filter(x => eids.includes(x.eventId))),
    getEventEntries: async eids => copy(db.entries.filter(x => eids.includes(x.eventId))),
    enterLeague: async (rid, eid, ids, marker = null) => { ids.forEach(m => db.leagueEntries.push({ eventId: eid, week: 1, memberId: m, roundId: rid, marker })); return 1 },
    enterEventRound: async (rid, eid, ids, marker = null) => { ids.forEach(m => db.entries.push({ eventId: eid, day: 1, memberId: m, roundId: rid, marker })); return 1 },
    getSignups: async () => copy({ comps: db.signups, entries: db.signupEntries }),
    saveSignup: async c => { if (c.id) Object.assign(db.signups.find(x => x.id === c.id), c); else db.signups.push({ ...c, id: id(), drawPublished: false, roundDeadlines: [] }) },
    deleteSignup: async cid => { db.signups = db.signups.filter(c => c.id !== cid) },
    getSignupCounts: async () => Object.fromEntries(db.signups.map(c => [c.id, db.signupEntries.filter(e => e.compId === c.id).length])),
    enterSignup: async (cid, partnerId = null) => { db.signupEntries.push({ compId: cid, memberId: ME, partnerId }) },
    withdrawSignup: async cid => { db.signupEntries = db.signupEntries.filter(e => !(e.compId === cid && (e.memberId === ME || e.partnerId === ME))) },
    setMyPlaysIn: async p => { db.members[0].playsIn = p },
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
    reportKoResult: async (mid, w, r) => Object.assign(db.koMatches.find(m => m.id === mid), { status: 'reported', winnerEntry: w, result: r, reportedEntry: db.signupEntries.find(e => e.memberId === ME || e.partnerId === ME)?.id }),
    confirmKoResult: async mid => { const m = db.koMatches.find(x => x.id === mid); m.status = 'confirmed'; db.koAdvance(m) },
    disputeKoResult: async mid => { db.koMatches.find(m => m.id === mid).status = 'disputed' },
    adminSetKoResult: async (mid, w, r) => { const m = db.koMatches.find(x => x.id === mid); Object.assign(m, { status: 'confirmed', winnerEntry: w, result: r }); db.koAdvance(m) },
    saveEvent: async e => { if (e.id) Object.assign(db.events.find(x => x.id === e.id), copy(e)); else db.events.push({ ...copy(e), id: id(), createdBy: { id: ME, name: 'Gary Cochrane' } }); return e.id ?? db.events.at(-1).id },
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
  for (const [k, f] of Object.entries(api)) api[k] = (...a) => { db.calls.push(k); return f(...a) }
  db.slotsOn = sheet
  db.koAdvance = m => { const n = db.koMatches.find(x => x.compId === m.compId && x.round === m.round + 1 && x.slot === Math.floor(m.slot / 2)); if (n) n[m.slot % 2 ? 'bEntry' : 'aEntry'] = m.winnerEntry }
  setup(db, { sheet, slotById, id })
  return { api, db }
}
