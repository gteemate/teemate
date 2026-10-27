// @vitest-environment happy-dom
// Find a time: the players in a knockout match suggest days (Morning, Afternoon or Evening), tick which they can do,
// and book a tee time once everyone can. Pretend server, like the other journeys.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { boot } from './driver.js'

vi.mock('../../api.js', async () => (await import('./fake-api.js')).mockModule())

let app
afterEach(() => { app?.done(); app = null })

// Men's Match Play (a club singles knockout): Gary (0) v Declan (1), round 1 to be played by Tue 20 Oct.
const koMatch = (by = ['2026-10-20', '2026-11-03']) => db => {
  Object.assign(db.signups[0], { closesOn: '2026-10-01', drawPublished: true, roundDeadlines: by })
  db.signupEntries.push(...[0, 1, 3, 5].map((m, i) => ({ id: 100 + i, compId: 1, memberId: m, partnerId: null })))
  db.koMatches.push({ id: 1, compId: 1, round: 1, slot: 0, aEntry: 100, bEntry: 101, winnerEntry: null, result: null, status: 'open', reportedEntry: null },
    { id: 2, compId: 1, round: 1, slot: 1, aEntry: 102, bEntry: 103, winnerEntry: null, result: null, status: 'open', reportedEntry: null },
    { id: 3, compId: 1, round: 2, slot: 0, aEntry: null, bEntry: null, winnerEntry: null, result: null, status: 'open', reportedEntry: null })
}
// Gary has suggested Mon 12 Oct morning and Wed 14 Oct evening; Declan is told.
const suggested = db => {
  koMatch()(db)
  db.matchTimes.push({ id: 51, matchId: 1, day: '2026-10-12', part: 'morning', by: 0, answers: { 0: true } }, { id: 52, matchId: 1, day: '2026-10-14', part: 'evening', by: 0, answers: { 0: true } })
  db.notices.push({ id: 61, memberId: 1, kind: 'times', date: '2026-10-12', oldTime: 0, newTime: null, byName: 'Gary Cochrane', note: 'Men’s Match Play', koMatchId: 1, seen: false })
}
const open = async () => { await app.tap('Competition'); await app.tap('Men’s Match Play') }

describe('Find a time', () => {
  it('suggest three days and send: the grid shows them, with me able to do each; Declan is told', async () => {
    app = await boot(koMatch())
    await open()
    await app.tap('Find a time')
    expect(app.text()).toContain('When suits you?')
    await app.tap('[data-k="2026-10-12|morning"]'); await app.tap('[data-k="2026-10-12|evening"]'); await app.tap('[data-k="2026-10-15|afternoon"]')
    expect(app.text()).toContain('3 of 6 picked')
    await app.tap('Send to Declan')
    expect(app.text()).toContain('Who can do which?')
    expect(document.querySelectorAll('tr[data-row]')).toHaveLength(3)
    expect(app.db.matchTimes.every(t => t.answers[0] === true)).toBe(true)
    expect(app.db.notices.some(n => n.memberId === 1 && n.kind === 'times')).toBe(true)
  })
  it('only days up to the play-by date are offered', async () => {
    app = await boot(koMatch())
    await open()
    await app.tap('Find a time')
    expect(document.querySelector('[data-k="2026-10-20|evening"]')).not.toBeNull()
    expect(document.querySelector('[data-k="2026-10-21|morning"]')).toBeNull()
  })
  it('Declan is told, ticks one, everyone can: Book a tee time opens the tee sheet on that day with Gary to add', async () => {
    app = await boot(suggested, { as: 'member' })
    expect(document.getElementById('alerts').textContent).toContain('Gary Cochrane suggests times for your Men’s Match Play match')
    await app.tap('[data-al="times"]')
    expect(app.text()).toContain('Who can do which?')
    await app.tap('[data-t="51"]')
    expect(app.db.matchTimes.find(t => t.id === 51).answers[1]).toBeUndefined() // not saved until Confirm
    await app.tap('Confirm my answers')
    expect(app.db.matchTimes.find(t => t.id === 51).answers[1]).toBe(true)
    expect(app.text()).toContain('Everyone can do Mon 12 Oct · morning')
    expect(app.db.notices.filter(n => n.kind === 'agreed').map(n => n.memberId).sort()).toEqual([0, 1])
    await app.tap('Book a tee time · Mon 12 Oct')
    expect(app.screen()).toBe('Book tee times')
    expect(document.querySelector('.day[aria-pressed="true"]').textContent).toContain('12')
    expect(app.text()).toContain('Morning times for your Men’s Match Play match')
  })
  it('my column cycles ✓, ✕, blank on screen; Confirm saves what it shows', async () => {
    app = await boot(suggested, { as: 'member' })
    await app.tap('[data-al="times"]')
    const cell = () => document.querySelector('[data-t="52"]').className
    await app.tap('[data-t="52"]'); expect(cell()).toContain('y')
    await app.tap('[data-t="52"]'); expect(cell()).toContain('n')
    await app.tap('Confirm my answers')
    expect(app.db.matchTimes.find(x => x.id === 52).answers[1]).toBe(false)
    expect(app.toast()).toBe('Your answers are in')
  })
  it('leaving with ticks not confirmed says so once; Back again leaves', async () => {
    app = await boot(suggested, { as: 'member' })
    await app.tap('[data-al="times"]')
    await app.tap('[data-t="52"]')
    await app.tap('#back')
    expect(app.toast()).toBe('You haven’t confirmed your answers')
    expect(app.screen()).toBe('Find a time')
    await app.tap('#back')
    expect(app.screen()).not.toBe('Find a time')
  })
  it('an “anything else” note, shown to the others with my name', async () => {
    app = await boot(suggested, { as: 'member' })
    await app.tap('[data-al="times"]')
    await app.type('#ft-note', 'any weekday after 5pm')
    await app.tap('Confirm my answers')
    expect(app.db.matchNotes[1][1]).toBe('any weekday after 5pm')
    expect(app.text()).toContain('You: any weekday after 5pm') // the others see “Declan: …”
  })
  it('Suggest other days adds to the same grid', async () => {
    app = await boot(suggested, { as: 'member' })
    await app.tap('[data-al="times"]')
    await app.tap('Suggest other days')
    expect(document.querySelector('[data-k="2026-10-12|morning"]')).toBeNull() // already suggested: not offered again
    await app.tap('[data-k="2026-10-13|afternoon"]')
    await app.tap('Send to Gary')
    expect(document.querySelectorAll('tr[data-row]')).toHaveLength(3)
  })
  it('the match card says how far it has got', async () => {
    app = await boot(suggested)
    await open()
    expect(app.text()).toContain('Find a time: 1 of 2 have answered')
  })
  it('a week from the play-by date with nothing arranged: a reminder with Find a time', async () => {
    app = await boot(koMatch(['2026-10-15', '2026-11-03']), { as: 'member' })
    expect(document.getElementById('alerts').textContent).toContain('Your Men’s Match Play match isn’t arranged yet: play by Thu 15 Oct')
    await app.tap('[data-al="findtime"]')
    expect(app.text()).toContain('When suits you?')
  })
  it('no reminder once a day is agreed', async () => {
    app = await boot(db => { suggested(db); db.koMatches[0] && Object.assign(db.signups[0], { roundDeadlines: ['2026-10-15', '2026-11-03'] }); db.matchTimes[0].answers[1] = true }, { as: 'member' })
    expect(document.getElementById('alerts').textContent).not.toContain('isn’t arranged yet')
  })
})

describe('Find a time: after review', () => {
  it('a match past its play-by date: no Find a time (it would have no days to offer)', async () => {
    app = await boot(koMatch(['2026-10-05', '2026-11-03']))
    await open()
    expect(app.text()).not.toContain('Find a time')
    expect(app.text()).toContain('Book this match')
  })
  it('a result clears the suggestions and their unseen notices (as the database does)', async () => {
    app = await boot(suggested)
    await globalThis.__world.wrapped.adminSetKoResult(1, 100, '2&1')
    expect(app.db.matchTimes.filter(t => t.matchId === 1)).toHaveLength(0)
    expect(app.db.notices.some(n => n.kind === 'times' && n.koMatchId === 1 && !n.seen)).toBe(false)
  })
  it('changing your ✓ takes back an unseen “everyone can do”', async () => {
    app = await boot(suggested, { as: 'member' })
    await app.tap('[data-al="times"]')
    await app.tap('[data-t="51"]'); await app.tap('Confirm my answers') // ✓: everyone can
    expect(app.db.notices.some(n => n.kind === 'agreed' && !n.seen)).toBe(true)
    await app.tap('[data-t="51"]'); await app.tap('Confirm my answers') // ✕
    expect(app.db.notices.some(n => n.kind === 'agreed' && !n.seen)).toBe(false)
  })
})

describe('Find a time: pairs', () => {
  // Men's Fourball (pairs): Gary (0) & Declan (1) v Ciarán (3) & Siobhán (5); Ciarán suggested Mon 12 Oct morning.
  const pairs = db => {
    Object.assign(db.signups[1], { closesOn: '2026-10-01', drawPublished: true, roundDeadlines: ['2026-10-20', '2026-11-03'] })
    db.signupEntries.push({ id: 200, compId: 2, memberId: 0, partnerId: 1 }, { id: 201, compId: 2, memberId: 3, partnerId: 5 })
    db.koMatches.push({ id: 9, compId: 2, round: 1, slot: 0, aEntry: 200, bEntry: 201, winnerEntry: null, result: null, status: 'open', reportedEntry: null })
    db.matchTimes.push({ id: 91, matchId: 9, day: '2026-10-12', part: 'morning', by: 3, answers: { 3: true } })
  }
  it('the same for my partner: my ticks copied to Declan’s column, saved with mine, marked as answered by me', async () => {
    app = await boot(pairs)
    await app.tap('Competition'); await app.tap('Men’s Fourball')
    await app.tap('Find a time')
    await app.tap('[data-t="91"]')
    await app.tap('#ft-same')
    expect(document.querySelector('[data-p="1"][data-tt="91"]').className).toContain('y') // shown in Declan's column before Confirm
    await app.tap('Confirm my answers')
    const t = app.db.matchTimes.find(x => x.id === 91)
    expect([t.answers[0], t.answers[1]]).toEqual([true, true])
    expect(app.text()).toContain('answered by you') // Declan sees “answered by Gary”
  })
  it('no “same for my partner” in a singles match', async () => {
    app = await boot(suggested)
    await app.tap('Competition'); await app.tap('Men’s Match Play')
    await app.tap('Find a time')
    expect(document.getElementById('ft-same')).toBeNull()
  })
})

describe('Find a time: from an agreed slot straight to booking it', () => {
  // Gary and Declan can both do Mon 12 Oct morning.
  const agreedMorning = db => { suggested(db); db.notices[0].seen = true; db.matchTimes[0].answers[1] = true; db.notices.push({ id: 62, memberId: 1, kind: 'agreed', date: '2026-10-12', oldTime: 0, newTime: null, note: 'Men’s Match Play', part: 'morning', koMatchId: 1, seen: false }) }
  const slotAt = (db, date, t) => db.slotsOn(date).find(s => s.time === t)
  it('Book a tee time opens the tee sheet for that day showing only the morning, Gary ready to add; Show all times', async () => {
    app = await boot(agreedMorning, { as: 'member' })
    await app.tap('Competition'); await app.tap('Men’s Match Play'); await app.tap('Find a time')
    await app.tap('Book a tee time · Mon 12 Oct')
    expect(app.text()).toContain('Morning times for your Men’s Match Play match')
    expect(document.querySelector(`[data-id="${slotAt(app.db, '2026-10-12', 600).id}"]`)).not.toBeNull()
    expect(document.querySelector(`[data-id="${slotAt(app.db, '2026-10-12', 780).id}"]`)).toBeNull() // 13:00: afternoon
    await app.tap('Show all times')
    expect(document.querySelector(`[data-id="${slotAt(app.db, '2026-10-12', 780).id}"]`)).not.toBeNull()
  })
  it('the “Everyone can do” notice goes straight to that slot on the tee sheet', async () => {
    app = await boot(agreedMorning, { as: 'member' })
    expect(document.getElementById('alerts').textContent).toContain('Everyone can do Mon 12 Oct · morning')
    await app.tap('[data-al="bookagreed"]')
    expect(app.screen()).toBe('Book tee times')
    expect(app.text()).toContain('Morning times for your Men’s Match Play match')
  })
  it('once booked, Find a time says when, with See the booking', async () => {
    app = await boot(db => { agreedMorning(db); db.book(1, slotAt(db, '2026-10-12', 600).id, [0]) }, { as: 'member' })
    await app.tap('Competition'); await app.tap('Men’s Match Play'); await app.tap('Find a time')
    expect(app.text()).toContain('Booked: Mon 12 Oct 10:00')
    expect(document.getElementById('ft-book')).toBeNull()
    await app.tap('See the booking')
    expect(app.screen()).toBe('Booking')
  })
})
