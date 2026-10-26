// @vitest-environment happy-dom
// The pretend server signed in as each kind of person the journeys are written for.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { boot } from './driver.js'

vi.mock('../../api.js', async () => (await import('./fake-api.js')).mockModule())
let app
afterEach(() => { app?.done(); app = null })
const me = () => globalThis.__world.api.getMe()

describe('people in the pretend server', () => {
  it('a member: not an admin, and sees only their own competition entries', async () => {
    app = await boot(db => db.signupEntries.push({ id: 70, compId: 2, memberId: 3, partnerId: 5 }), { as: 'member' })
    expect(await me()).toMatchObject({ id: 1, admin: false, office: false })
    expect((await globalThis.__world.api.getSignups()).entries).toEqual([])
    await app.tap('#account')
    expect(app.main()).not.toContain('Club office')
  })
  it('an organiser and a captain are ordinary members', async () => {
    app = await boot(() => {}, { as: 'organiser' }); expect(await me()).toMatchObject({ id: 7, admin: false }); app.done()
    app = await boot(() => {}, { as: 'captain' }); expect(await me()).toMatchObject({ id: 12, admin: false })
    expect(app.db.events.find(e => e.name === 'Winter League').teams[0].captain).toBe(12)
  })
  it('halfway hut staff', async () => {
    app = await boot(() => {}, { as: 'hut' })
    expect(await me()).toMatchObject({ id: 10, hutStaff: true, admin: false })
  })
  it('the club office', async () => {
    app = await boot(() => {}, { as: 'office' })
    expect(await me()).toMatchObject({ office: true, admin: true })
    expect(document.querySelector('[data-ov="today"]')).not.toBeNull()
  })
  it('a visitor and a new joiner start signed out', async () => {
    app = await boot(() => {}, { as: 'visitor' })
    expect(await globalThis.__world.api.getSession()).toBeNull()
    expect(app.text()).toMatch(/sign in/i)
    app.done()
    app = await boot(() => {}, { as: 'newjoiner' })
    expect(await globalThis.__world.api.needsAccount('new.joiner@example.invalid')).toBe(true)
  })
})
