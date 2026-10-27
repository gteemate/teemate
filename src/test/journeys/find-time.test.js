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
    expect(app.db.matchTimes.find(t => t.id === 51).answers[1]).toBe(true)
    expect(app.text()).toContain('Everyone can do Mon 12 Oct · morning')
    expect(app.db.notices.filter(n => n.kind === 'agreed').map(n => n.memberId).sort()).toEqual([0, 1])
    await app.tap('Book a tee time · Mon 12 Oct')
    expect(app.screen()).toBe('Book tee times')
    expect(document.querySelector('.day[aria-pressed="true"]').textContent).toContain('12')
    expect(app.text()).toContain('Booking your match')
  })
  it('my column cycles ✓, ✕, blank', async () => {
    app = await boot(suggested, { as: 'member' })
    await app.tap('[data-al="times"]')
    const t = () => app.db.matchTimes.find(x => x.id === 52).answers[1]
    await app.tap('[data-t="52"]'); expect(t()).toBe(true)
    await app.tap('[data-t="52"]'); expect(t()).toBe(false)
    await app.tap('[data-t="52"]'); expect(t()).toBeUndefined()
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
