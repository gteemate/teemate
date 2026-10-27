// @vitest-environment happy-dom
// Ripples: when something is deleted or cancelled, it goes everywhere it showed, for everyone, and every screen still
// draws. One person does it; then another person opens the app on the same club (the pretend database carried over).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { boot } from './driver.js'

vi.mock('../../api.js', async () => (await import('./fake-api.js')).mockModule())
let app
afterEach(() => { app?.done(); app = null })

const at = (db, time, date = db.today) => db.slotsOn(date).find(s => s.time === time)
/** The club's data after one person's visit, to open as someone else. */
const keep = db => JSON.stringify(Object.fromEntries(Object.entries(db).filter(([k, v]) => typeof v !== 'function' && !['me', 'calls', 'refuse', 'asOffice', 'signedOut'].includes(k))))
const restore = saved => db => Object.assign(db, JSON.parse(saved))
const screensDraw = async () => { // the main places a card, an event or a match shows
  app.check(); await app.homeFromHere()
  for (const t of ['Scoring', 'Competition']) { await app.tap(t); app.check(); await app.homeFromHere() }
}

// Declan (1) and Peter (7) at 09:30: Peter's card, two holes from starting, counting for an event, the Winter League
// (both play in it) and their knockout match.
const shared = db => {
  const b = db.book(7, at(db, 570).id, [1])
  db.rounds.push({ id: 61, date: db.today, slotId: b.slotId, createdBy: 7, lineup: [{ m: 7 }, { m: 1 }], game: 'stab', pairing: 0, submitted: {},
    scores: Array.from({ length: 18 }, () => [4, 4]), done: Array(18).fill(false) })
  db.events.push({ id: 950, name: 'Pals Medal', style: 'individual', fmt: 'stab', club: false, everyone: false, startDate: db.today, days: 1, players: [1, 7], team: {}, teams: [], matches: {}, captainPool: [], entryRequired: true, createdBy: { id: 7, name: 'Peter Walsh' } })
  db.entries.push({ eventId: 950, day: 1, memberId: 1, roundId: 61 }, { eventId: 950, day: 1, memberId: 7, roundId: 61 })
  const lg = db.events.find(e => e.name === 'Winter League'); lg.players.push(7); lg.team[7] = 1
  db.leagueEntries.push({ eventId: lg.id, week: 1, memberId: 1, roundId: 61 }, { eventId: lg.id, week: 1, memberId: 7, roundId: 61 })
  Object.assign(db.signups[0], { closesOn: '2026-10-01', drawPublished: true, roundDeadlines: ['2026-11-15'] })
  db.signupEntries.push({ id: 100, compId: 1, memberId: 1, partnerId: null }, { id: 101, compId: 1, memberId: 7, partnerId: null })
  db.koMatches.push({ id: 1, compId: 1, round: 1, slot: 0, aEntry: 100, bEntry: 101, winnerEntry: null, result: null, status: 'open', reportedEntry: null, roundId: 61 })
}

describe('ripples: a deleted scorecard goes everywhere, for everyone on it', () => {
  it('Declan deletes the unfinished card: it no longer counts for the event, the league or the knockout, and Peter’s Scores tab starts fresh', async () => {
    app = await boot(shared, { as: 'member' })
    await app.tap('Scoring')
    expect(app.screen()).toMatch(/^Hole/)
    await app.tap('#delcard'); await app.tap('#delcard')
    const db = app.db
    expect(db.rounds.some(r => r.id === 61)).toBe(false)
    expect(db.entries.filter(x => x.roundId === 61)).toEqual([])
    expect(db.leagueEntries.filter(x => x.roundId === 61)).toEqual([])
    expect(db.koMatches[0].roundId ?? null).toBe(null)
    const saved = keep(db)
    app.done()
    app = await boot(restore(saved), { as: 'organiser' }) // Peter opens the app
    await app.tap('Scoring')
    expect(app.screen()).not.toMatch(/^Hole/) // no card: a new round
    await app.homeFromHere()
    await app.tap('Competition'); await app.tap('Men’s Match Play')
    expect(app.main()).not.toContain('On the card')
    await app.homeFromHere()
  })
})

describe('ripples: a deleted member', () => {
  it('the office deletes Declan: he’s off the event, the league and the knockout, and Peter’s screens all still draw', async () => {
    app = await boot(db => {
      shared(db); db.rounds[0].done = Array(18).fill(true) // a finished card: kept as history
      db.events.push({ id: 900, name: 'Pals Season', A: { name: 'Blues', col: '#19335A' }, B: { name: 'Reds', col: '#762A43' }, club: false, everyone: false, startDate: '2026-10-07', days: 176, season: true, style: 'ryder', fmt: 'bbl', entryRequired: true,
        players: [7, 9, 10, 1], team: { 7: 'A', 9: 'A', 10: 'B', 1: 'B' }, matches: { 1: [{ a: [7, 9], b: [10, 1] }], 6: [{ a: [7], b: [1] }] }, createdBy: { id: 7, name: 'Peter Walsh' } })
    }, { as: 'office' })
    await app.tap('[data-ov="members"]'); await app.tap('[data-o-m="1"]'); await app.tap('#o-del'); await app.tap('#o-del')
    const db = app.db
    expect(db.events.filter(e => e.players.includes(1)).map(e => e.name)).toEqual([])
    expect(db.events.filter(e => e.team && 1 in e.team).map(e => e.name)).toEqual([])
    expect(db.signupEntries.some(e => e.memberId === 1)).toBe(false)
    expect(db.koMatches[0].aEntry).toBe(null)
    const saved = keep(db)
    app.done()
    app = await boot(restore(saved), { as: 'organiser' })
    await screensDraw()
    await app.tap('Competition'); await app.tap('Men’s Match Play'); app.check(); await app.homeFromHere()
    await app.tap('Competition'); await app.tap('[data-tab="entered"]'); await app.tap('Pals Medal'); app.check(); await app.homeFromHere()
    await app.tap('Competition'); await app.tap('[data-tab="entered"]'); await app.tap('Pals Season'); app.check() // match days that had Declan still draw
    for (const m of document.querySelectorAll('[data-match]')) { m.click(); await app.settle(); app.check(); await app.back() }
    await app.homeFromHere()
  })
})

describe('ripples: a cancelled booking', () => {
  it('the booker cancels: the other player’s unstarted card for that tee time goes too', async () => {
    app = await boot(db => { const b = db.book(1, at(db, 570).id, [7]); db.rounds.push({ id: 62, date: db.today, slotId: b.slotId, createdBy: 7, lineup: [{ m: 7 }, { m: 1 }], game: 'stab', pairing: 0, submitted: {}, scores: Array.from({ length: 18 }, () => [4, 4]), done: Array(18).fill(false) }) }, { as: 'member' })
    await app.tap('Booking'); await app.tap('09:30'); await app.tap('Delete booking'); await app.tap('Tap again to delete')
    expect(app.db.bookings).toEqual([])
    expect(app.db.rounds.some(r => r.id === 62)).toBe(false)
  })
})
