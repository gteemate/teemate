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
    expect(reached.size, `screens reached: ${[...reached].join(', ')}`).toBeGreaterThanOrEqual(18) // it really went places (the admin pages are in the club office: below)
  }, 60000)

  it('the club office: every section, and every page one tap from it, draws without errors and gets back to its section', async () => {
    app = await boot(db => { db.asOffice = true; busy(db) })
    const fails = [], reached = new Set()
    for (const sec of ['Today', 'Members', 'Tee sheet', 'Competitions', 'Club']) {
      await app.tap(`[data-ov]:nth-of-type(${['Today', 'Members', 'Tee sheet', 'Competitions', 'Club'].indexOf(sec) + 1})`, { count: false })
      const there = app.screen()
      reached.add(there)
      const inside = [...document.querySelectorAll('#main button')].map(b => b.textContent.replace(/\s+/g, ' ').trim()).filter(l => l && !SKIP.test(l) && !/let in|refuse|book it/i.test(l))
      for (const b of new Set(inside)) {
        try {
          await app.tap(`[data-ov="${({ Today: 'today', Members: 'members', 'Tee sheet': 'tee', Competitions: 'comps', Club: 'club' })[sec]}"]`, { count: false })
          if (!app.labels().includes(b)) continue
          await app.tap(b, { count: false })
          reached.add(app.screen())
          document.getElementById('opx')?.click() // a side panel: close it
          await app.settle()
          for (let i = 0; i < 5 && document.getElementById('back'); i++) await app.tap('#back', { count: false })
          if (app.screen() === 'Home') throw new Error('back left the office')
        } catch (e) { fails.push(`${sec} → ${b}: ${e.message.split('\n')[0]}`); app.errors.length = 0 }
      }
    }
    expect(fails).toEqual([])
    expect(reached.size, `pages reached: ${[...reached].join(', ')}`).toBeGreaterThanOrEqual(10)
  }, 60000)
})
