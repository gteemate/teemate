// @vitest-environment happy-dom
// A finished individual event crowns its winner at the top of the leaderboard. Pretend server, like the other journeys.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { boot } from './driver.js'

vi.mock('../../api.js', async () => (await import('./fake-api.js')).mockModule())

let app
afterEach(() => { app?.done(); app = null })

// A Stableford on `date` (the test day is Sat 10 Oct): Gary, Declan and Ciarán on one card; Gary has the best day.
const stableford = date => db => {
  db.asOffice = true
  db.events.push({ id: 960, name: 'Saturday Stableford', style: 'individual', fmt: 'stab', club: true, everyone: true, selfEntry: true, startDate: date, days: 1,
    players: [0, 1, 3], team: {}, matches: {}, createdBy: { id: 0, name: 'Gary Cochrane' } })
  db.rounds.push({ id: 961, date, lineup: [{ m: 0 }, { m: 1 }, { m: 3 }], scores: Array.from({ length: 18 }, () => [3, 5, 6]), done: Array(18).fill(true), updated_at: `${date}T12:00:00Z` })
}
const board = async () => { await app.tap('[data-ov="comps"]'); await app.tap('[data-o-comp="e:960"]'); await app.tap('[data-o-go="board:960"]') }

describe('a finished event’s winner', () => {
  it('once its day has passed: the winner and their points, crowned at the top', async () => {
    app = await boot(stableford('2026-10-09'))
    await board()
    const win = document.querySelector('.evwin')
    expect(win.textContent).toContain('Winner')
    expect(win.textContent).toContain('Gary Cochrane')
    expect(win.textContent).toContain(document.querySelector('.lbrow .lval').textContent)
  })
  it('on the day itself: no winner yet', async () => {
    app = await boot(stableford('2026-10-10'))
    await board()
    expect(document.querySelector('.evwin')).toBe(null)
  })
})
