// @vitest-environment happy-dom
// Journey tests: a member taps through whole tasks in the real app (pretend server), and each journey checks they
// never get stuck (back always reaches Home, no loops), nothing errors, and it takes no more taps than it should.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { boot } from './driver.js'

vi.mock('../../api.js', async () => (await import('./fake-api.js')).mockModule())

let app
afterEach(() => app?.done())

describe('journeys', () => {
  it('smoke: Home has its four tiles; the weather opens and back goes Home', async () => {
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
