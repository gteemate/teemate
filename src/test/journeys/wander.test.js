// @vitest-environment happy-dom
// Wander: from Home, tap into every screen within two taps (as an admin, with a round on the go and a tee time
// today), and check each one draws without errors and that back always gets you Home. Buttons that change things
// (delete, confirm, send, save…) are skipped: the journeys cover those.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { boot } from './driver.js'

vi.mock('../../api.js', async () => (await import('./fake-api.js')).mockModule())

const SKIP = /delete|cancel|remove|sign out|send|confirm|save|accept|decline|withdraw|move|start round|book |^order$|share|copy|password|approve|tap again|clear|sure|reset|add guest|publish|draw captains|balance|enter scores|start scoring|rearrange|add to friends|later|^ok$|×|^[−+]$|^‹$/i
const busy = db => {
  const at = t => db.slotsOn(db.today).find(s => s.time === t)
  db.book(0, at(570).id, [1])
}

let app
afterEach(() => app?.done())

describe('wander: every screen within two taps of Home', () => {
  it('draws without errors, and back always reaches Home', async () => {
    app = await boot(busy)
    if (app.screen() !== 'Home') await app.homeFromHere()
    const fails = [], reached = new Set()
    const firsts = app.labels().filter(l => !SKIP.test(l))
    for (const a of firsts) {
      try {
        await app.tap(a, { count: false })
        const there = app.screen()
        reached.add(there)
        const seconds = app.labels().filter(l => !SKIP.test(l) && l !== '‹ Back' && !firsts.includes(l))
        await app.homeFromHere()
        for (const b of seconds) {
          try {
            await app.tap(a, { count: false })
            if (app.screen() !== there) continue // that screen changed (e.g. a sheet): skip
            if (!app.labels().includes(b)) { await app.homeFromHere(); continue } // not there this time (e.g. a remembered tab)
            await app.tap(b, { count: false })
            reached.add(app.screen())
            await app.homeFromHere()
          } catch (e) { fails.push(`${a} → ${b}: ${e.message.split('\n')[0]}`); app.errors.length = 0; await app.homeFromHere().catch(() => {}) }
        }
      } catch (e) { fails.push(`${a}: ${e.message.split('\n')[0]}`); app.errors.length = 0; await app.homeFromHere().catch(() => {}) }
    }
    expect(fails).toEqual([])
    expect(reached.size, `screens reached: ${[...reached].join(', ')}`).toBeGreaterThanOrEqual(20) // it really went places
  }, 60000)
})
