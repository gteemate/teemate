// @vitest-environment happy-dom
// Every journey in the list, as its person: the happy path does what it should; and for every way the server can say
// no, the message is seen where the person is looking, the screen isn't stuck, and nothing is half-saved.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { boot } from './driver.js'
import { JOURNEYS } from './catalogue.js'
import { runSteps, fillMessage } from './steps.js'
import { whereSeen } from './seen.js'

vi.mock('../../api.js', async () => (await import('./fake-api.js')).mockModule())
const INDEX = JSON.parse(readFileSync(`${process.cwd()}/src/test/journeys/refusal-index.json`, 'utf8'))

/** The refusal messages a journey is checked against. */
export function refusalsOf(j) {
  if (j.refusals?.none) return []
  if (Array.isArray(j.refusals)) return j.refusals
  const fns = INDEX.api[j.action]?.rpc ?? []
  return [...new Set(fns.flatMap(f => INDEX.db[f] ?? []))].filter(m => !(m in (j.unreachable ?? {})))
}
// The pretend database, without the call log and the refusal switch (for "nothing half-saved").
const snapshot = db => JSON.stringify(Object.fromEntries(Object.entries(db).filter(([k, v]) => !['calls', 'refuse'].includes(k) && typeof v !== 'function')))

let app
afterEach(() => { app?.done(); app = null })

describe.each(JOURNEYS.map(j => [j.id, j]))('%s', (_, j) => {
  it(`${j.title} (as ${j.who})`, async () => {
    app = await boot(j.setup ?? (() => {}), { as: j.who })
    await runSteps(app, j.steps)
    expect(app.db.calls, `the journey should end in ${j.action}`).toContain(j.action)
    expect(j.expect(app.db, app)).toBeTruthy()
  })
  const msgs = refusalsOf(j)
  if (msgs.length) it.each(msgs)('refused: “%s” is seen, not stuck, nothing half-saved', async msg => {
    app = await boot(j.setup ?? (() => {}), { as: j.who })
    await runSteps(app, j.steps.slice(0, -1))
    const before = snapshot(app.db), text = fillMessage(msg)
    app.db.refuse = { [j.action]: text }
    await runSteps(app, j.steps.slice(-1))
    expect(whereSeen(text), 'the refusal should be seen where the person is looking').toMatch(/^(modal|notice|page)$/)
    const last = j.steps.at(-1).tap, el = last && (/^[#.[]/.test(last) ? document.querySelector(last) : [...document.querySelectorAll('button')].find(b => b.textContent.trim() === last))
    if (el) expect(el.disabled, 'the button should work again').toBe(false)
    expect(snapshot(app.db), 'nothing should be half-saved').toBe(before)
  })
})
