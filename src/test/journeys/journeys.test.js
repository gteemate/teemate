// @vitest-environment happy-dom
// Journey tests: a member taps through whole tasks in the real app (pretend server), and each journey checks they
// never get stuck (back always reaches Home, no loops), nothing errors, and it takes no more taps than it should.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { boot } from './driver.js'

vi.mock('../../api.js', async () => (await import('./fake-api.js')).mockModule())

let app
afterEach(() => app?.done())

const at = (db, time, date = db.today) => db.slotsOn(date).find(s => s.time === time)

describe('journeys', () => {
  it('1. Book a tee time with a friend', async () => {
    app = await boot()
    await app.tap('Booking')
    await app.tap('+ Add a booking')
    await app.tap('10:20')
    await app.tap('[data-open]')
    await app.tap('Declan Murphy')
    await app.tap('Confirm booking')
    expect(app.screen()).toBe('Booked')
    expect(at(app.db, 620).players.map(p => p.name)).toEqual(['Gary Cochrane', 'Declan Murphy'])
    expect(app.taps).toBeLessThanOrEqual(6)
    await app.homeFromHere()
  })

  it('2. Book with a friend from another club as a guest (their details filled in)', async () => {
    app = await boot()
    await app.tap('Booking')
    await app.tap('+ Add a booking')
    await app.tap('10:30')
    await app.tap('[data-open]')
    await app.tap('Sam Visitor')
    expect(document.getElementById('g-name').value).toBe('Sam Visitor')
    await app.tap('Add guest')
    await app.tap('Confirm booking')
    expect(at(app.db, 630).players.map(p => p.name)).toEqual(['Gary Cochrane', 'Sam Visitor'])
    expect(app.taps).toBeLessThanOrEqual(7)
    await app.homeFromHere()
  })

  it('3. Delete a booking that has scores: warned, and the scorecard goes too', async () => {
    app = await boot((db, h) => {
      const b = db.book(0, at(db, 540).id, [1])
      db.rounds.push({ id: 77, date: db.today, slotId: b.slotId, lineup: [{ m: 0 }, { m: 1 }], game: 'stab', pairing: 0, submitted: {},
        scores: Array.from({ length: 18 }, () => [4, 4]), done: Array.from({ length: 18 }, (_, i) => i < 6) })
    })
    expect(app.screen()).toMatch(/^Hole/) // mid-round, the app opens on the scorecard
    await app.back()
    await app.tap('Booking')
    await app.tap('09:00')
    expect(app.text()).toContain('Scores entered for 6 holes')
    await app.tap('Delete booking and scores')
    await app.tap('Tap again to delete')
    expect(app.db.bookings).toEqual([])
    expect(app.db.rounds).toEqual([])
    expect(app.taps).toBeLessThanOrEqual(5)
    await app.homeFromHere()
  })

  it('4. Request a tee time further ahead, then cancel it', async () => {
    app = await boot()
    await app.tap('Booking')
    await app.tap('Request a tee time further ahead')
    expect(app.screen()).toBe('Request a tee time')
    await app.tap('10:20')
    await app.type('#rq-why', 'Visitors from Boston')
    await app.tap('Send request')
    expect(app.screen()).toBe('Booking')
    expect(app.db.requests.map(r => [r.time, r.status])).toEqual([[620, 'pending']])
    await app.tap('Cancel')
    await app.tap('Sure?')
    expect(app.db.requests[0].status).toBe('cancelled')
    expect(app.taps).toBeLessThanOrEqual(6)
    await app.homeFromHere()
  })

  it('4b. An approved request whose booking was cancelled says so, and can be removed from the list', async () => {
    app = await boot(db => db.requests.push({ id: 36, memberId: 0, slotId: 1, date: '2026-10-30', time: 460, memberIds: [], guests: [], reason: 'Visitors flying in from Boston',
      status: 'approved', bookingId: null, note: null, decidedAt: '2026-10-09T18:45:00Z', seen: true, createdAt: '2026-10-09T18:00:00Z' }))
    await app.tap('Booking')
    expect(app.text()).toContain('Approved, then cancelled')
    await app.tap('Remove')
    expect(app.text()).not.toContain('Visitors flying in from Boston')
    expect(app.taps).toBeLessThanOrEqual(2)
    await app.homeFromHere()
  })

  it('5. Book your match from the event, then rearrange it', async () => {
    app = await boot()
    await app.tap('Competition')
    await app.tap('Christmas Cup')
    await app.tap('Book this match')
    expect(app.text()).toContain('Booking your match')
    await app.tap('10:40')
    await app.tap('Confirm booking')
    expect(at(app.db, 640).players.map(p => p.memberId).sort()).toEqual([0, 1, 3, 5])
    expect(app.taps).toBeLessThanOrEqual(5)
    await app.homeFromHere()
    app.taps = 0
    await app.tap('Competition')
    await app.tap('Christmas Cup')
    await app.tap('Rearrange')
    await app.tap('11:00')
    await app.tap('Move match to 11:00')
    expect(at(app.db, 660).players.length).toBe(4)
    expect(at(app.db, 640).players.length).toBe(0)
    expect(app.taps).toBeLessThanOrEqual(5)
    await app.homeFromHere()
  })

  it("5b. Booked apart (each with other people): the match offers Book this match, 2 hours from everyone's tee times", async () => {
    app = await boot(db => { db.book(0, at(db, 480).id, [9, 8, 7]); db.book(3, at(db, 770).id, [12]) }) // me 08:00, Ciarán 12:50, each with others
    await app.tap('Competition')
    await app.tap('Christmas Cup')
    expect(app.text()).toContain('Already booked today: you at 08:00, Ciarán O\'Neill at 12:50')
    await app.tap('Book this match')
    expect(app.screen()).toBe('Book tee times')
    expect(app.text()).toContain('Booking your match')
    const open = [...document.querySelectorAll('.slot:not(.full)')].map(b => b.textContent.match(/\d\d:\d\d/)[0])
    expect(open).toEqual(['10:00', '10:10', '10:20', '10:30', '10:40', '10:50']) // the only times 2 hours from both
    expect(open.every(t => { const m = +t.slice(0, 2) * 60 + +t.slice(3); return Math.abs(m - 480) >= 120 && Math.abs(m - 770) >= 120 })).toBe(true)
    await app.homeFromHere()
  })

  const teeTimeToday = db => db.book(0, at(db, 570).id, [1]) // 09:30 with Declan Murphy (both in the Winter League)

  it('6. Start a round, count it for the Winter League (marker), save to hole 8, order a bacon roll', async () => {
    app = await boot(teeTimeToday)
    await app.tap('Scoring')
    await app.tap('09:30')
    expect(app.screen()).toBe('Scoring round?')
    await app.tap('Winter League')
    expect(app.text()).toContain('Marker: Declan Murphy')
    await app.tap('Start round · Winter League')
    for (let h = 1; h <= 8; h++) await app.tap(`Save hole ${h}`)
    expect(app.text()).toContain('Halfway hut is open')
    await app.tap('Order')
    expect(app.screen()).toBe('Halfway hut')
    await app.tap('One more Bacon roll')
    await app.tap('Send order')
    expect(app.db.leagueEntries.map(x => [x.memberId, x.marker])).toEqual([[0, { m: 1 }], [1, { m: 0 }]])
    expect(app.db.orders.map(o => o.items.map(i => i.name))).toEqual([['Bacon roll']])
    expect(app.screen()).toMatch(/^Hole/) // back on the scorecard
    expect(app.taps).toBeLessThanOrEqual(15)
    await app.homeFromHere()
  })

  it("7. Join today's club competition as you start", async () => {
    app = await boot(teeTimeToday)
    await app.tap('Scoring')
    await app.tap('09:30')
    expect(app.text()).toContain('Saturday Medal is on today. Do you want to play in it?')
    await app.tap('Saturday Medal')
    await app.tap('Start round · Saturday Medal')
    expect(app.db.events.find(e => e.id === 21).players).toContain(0)
    expect(app.db.entries).toMatchObject([{ eventId: 21, memberId: 0, marker: { m: 1 } }])
    expect(app.taps).toBeLessThanOrEqual(4)
    await app.homeFromHere()
  })

  it('11. Sign up for Men’s Fourball with a partner, see it in Entered, then withdraw', async () => {
    app = await boot()
    await app.tap('Competition')
    await app.tap('Events')
    expect(app.text()).toContain('Men’s Match Play')
    expect(app.text()).not.toContain('Ladies Singles') // a man doesn't see the ladies' competitions
    await app.tap('Men’s Fourball')
    await app.tap('Declan Murphy')
    await app.tap('Enter as a pair')
    expect(app.db.signupEntries).toEqual([{ compId: 2, memberId: 0, partnerId: 1 }])
    expect(app.text()).toContain('With Declan Murphy')
    expect(app.taps).toBeLessThanOrEqual(5)
    await app.tap('Withdraw (both of you)')
    await app.tap('Tap again to withdraw')
    expect(app.db.signupEntries).toEqual([])
    await app.homeFromHere()
  })

  it('12. Knockout: report my result, my opponent confirms, I go through to the next round', async () => {
    app = await boot(db => {
      Object.assign(db.signups[0], { closesOn: '2026-10-01', drawPublished: true, roundDeadlines: ['2026-11-15', '2026-12-06'] })
      db.signupEntries.push(...[0, 1, 3, 5].map((m, i) => ({ id: 100 + i, compId: 1, memberId: m, partnerId: null })))
      db.koMatches.push({ id: 1, compId: 1, round: 1, slot: 0, aEntry: 100, bEntry: 101, winnerEntry: null, result: null, status: 'open', reportedEntry: null },
        { id: 2, compId: 1, round: 1, slot: 1, aEntry: 102, bEntry: 103, winnerEntry: null, result: null, status: 'open', reportedEntry: null },
        { id: 3, compId: 1, round: 2, slot: 0, aEntry: null, bEntry: null, winnerEntry: null, result: null, status: 'open', reportedEntry: null })
    })
    await app.tap('Competition')
    await app.tap('Men’s Match Play')
    expect(app.text()).toContain('v Declan Murphy')
    expect(app.text()).toContain('Play by Sun 15 Nov')
    await app.tap('Enter result')
    await app.tap('[data-kw="100"]')
    await app.tap('3&2')
    await app.tap('Save result')
    expect(app.text()).toContain('waiting for them to confirm')
    // Declan confirms on his phone (here: straight to the server).
    await app.db.koMatches[0] && (app.db.koMatches[0].status = 'confirmed', app.db.koAdvance(app.db.koMatches[0]))
    await app.tap('Whole draw')
    expect(app.db.koMatches[2].aEntry).toBe(100) // through to the final
    expect(app.taps).toBeLessThanOrEqual(7)
    await app.homeFromHere()
  })

  it('13. Admin: a knockout competition from Club events, with an entry limit; members see places left, then Full', async () => {
    app = await boot()
    await app.tap('Gary Cochrane')
    await app.tap('Club events')
    await app.tap('+ New knockout competition')
    expect(document.getElementById('sc-name')).not.toBeNull() // the add form opens straight away
    await app.type('#sc-name', 'Winter Knockout')
    await app.type('#sc-close', '2026-10-31')
    await app.type('#sc-max', '2')
    await app.tap('#sc-open')
    await app.tap('Add')
    expect(app.db.signups.find(c => c.name === 'Winter Knockout')).toMatchObject({ category: 'men', kind: 'singles', closesOn: '2026-10-31', maxEntries: 2, open: true })
    expect(app.text()).toContain('Winter Knockout')
    await app.homeFromHere()
  })

  it('14. A competition with all its places taken shows Full, with no Enter', async () => {
    app = await boot(db => { db.signups[0].maxEntries = 2; db.signupEntries.push({ id: 1, compId: 1, memberId: 3, partnerId: null }, { id: 2, compId: 1, memberId: 5, partnerId: null }); db.signups[1].maxEntries = 16 })
    await app.tap('Competition')
    await app.tap('Events')
    expect(app.text()).toContain('all 2 places taken')
    expect(app.text()).toContain('16 places left')
    expect(app.labels().some(l => l.startsWith('Men’s Match Play') && l.includes('Enter'))).toBe(false)
    await app.homeFromHere()
  })

  it('15. A member sets up their own knockout: picks the players, it’s drawn, they organise it', async () => {
    app = await boot()
    await app.tap('Competition')
    await app.tap('Events')
    await app.tap('+ Create your own event')
    await app.tap('A knockout')
    expect(app.screen()).toBe('New knockout')
    await app.type('#kn-name', 'Friday Knockout')
    await app.type('#kn-fin', '2026-12-31')
    for (const n of ['Gary Cochrane (you)', 'Declan Murphy', 'Ciarán O\'Neill', 'Mark Doherty']) await app.tap(n)
    await app.tap('Make the draw')
    expect(app.screen()).toBe('Friday Knockout')
    const ko = app.db.signups.find(c => c.name === 'Friday Knockout')
    expect(app.db.signupEntries.filter(e => e.compId === ko.id).map(e => e.memberId).sort()).toEqual([0, 1, 3, 5])
    expect(ko.roundDeadlines).toHaveLength(2) // semi-finals, final
    expect(app.text()).toContain('Your next match')
    expect(app.labels()).toContain('Set result') // the organiser can set results
    expect(app.taps).toBeLessThanOrEqual(10)
    await app.homeFromHere()
  })

  it('8. Add a friend from a shared link', async () => {
    app = await boot(undefined, { hash: '#friend?n=Eoin+Fitzgerald&c=Royal+Teemate&h=2.1&m=9&d=2026-10-10' })
    expect(app.screen()).toBe('Add friend')
    await app.tap('Add to friends')
    expect(app.db.buddies.map(b => b.id)).toContain(9)
    expect(app.screen()).toBe('Friends')
    expect(app.taps).toBeLessThanOrEqual(1)
    await app.homeFromHere()
  })

  it('10. Accept a match challenge from the drop-down', async () => {
    app = await boot(db => {
      const mine = db.book(0, at(db, 570).id, [1]), theirs = db.book(7, at(db, 560).id, [11])
      db.playerEvents.push({ id: 5, date: db.today, style: 'fourball', format: 'best2', status: 'pending', proposerSlot: theirs.slotId, proposedBy: { id: 7, name: 'Peter Walsh' },
        createdBy: { id: 7, name: 'Peter Walsh' }, teamNames: {}, players: [{ id: 1, memberId: 0, name: 'Gary Cochrane', slot: mine.slotId }, { id: 2, memberId: 7, name: 'Peter Walsh', slot: theirs.slotId }],
        groups: [{ slot: theirs.slotId, time: 560, host: true, answer: null }, { slot: mine.slotId, time: 570, host: false, answer: null }] })
    })
    expect(app.text()).toContain("Peter Walsh's four-ball (09:20) has challenged your group")
    await app.tap('Accept')
    expect(app.db.playerEvents[0].status).toBe('accepted')
    expect(app.taps).toBe(1)
  })

  it('9. Home has its four tiles; the weather opens and back goes Home', async () => {
    app = await boot()
    expect(app.screen()).toBe('Home')
    for (const t of ['Booking', 'Competition', 'Friends', 'Scoring']) expect(app.text()).toContain(t)
    await app.tap('Weather: wind 12 miles an hour, 1 millimetres of rain today')
    expect(app.screen()).toBe('Weather')
    await app.homeFromHere()
    expect(app.taps).toBeLessThanOrEqual(2)
  })
})

import { readFileSync, readdirSync } from 'node:fs'
import { API_NAMES } from './fake-api.js'
describe('the pretend server', () => {
  it('has every function src/api.js exports (so a new one is never silently missing)', () => {
    const dir = `${process.cwd()}/src/api`
    const real = readdirSync(dir).flatMap(f => [...readFileSync(`${dir}/${f}`, 'utf8').matchAll(/^export (?:async )?function (\w+)/gm)].map(m => m[1]))
    const fromClient = ['getMe', 'forgetMe']
    expect([...API_NAMES].sort()).toEqual([...new Set([...real.filter(n => n !== 'getMe'), ...fromClient])].sort())
  })
})
