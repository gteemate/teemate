// @vitest-environment happy-dom
// Journeys for data kept on the device: screens reuse what they've fetched, refetch only what another person changed
// (when the stamps say so), and show your own changes at once. Pretend server; db.calls lists every server call.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { boot } from './driver.js'

vi.mock('../../api.js', async () => (await import('./fake-api.js')).mockModule())

let app
afterEach(() => { app?.done(); app = null })
const callsTo = name => app.db.calls.filter(c => c === name).length
const openEntered = async () => { await app.tap('Competition'); await app.tap('[data-tab="entered"]') }

describe('data kept on the device', () => {
  it('a screen opened twice fetches kept kinds once', async () => {
    app = await boot(() => {})
    await openEntered()
    await app.homeFromHere()
    await openEntered()
    expect(callsTo('getEvents')).toBe(1)
    expect(callsTo('getMembers')).toBe(1)
  })
  it('someone else’s change shows after the check', async () => {
    app = await boot(() => {})
    await openEntered()
    const e = app.db.events.find(x => app.main().includes(x.name))
    e.name = 'Renamed Cup'
    app.db.stamps.events = '2'
    await vi.advanceTimersByTimeAsync(31_000)
    document.dispatchEvent(new Event('visibilitychange'))
    await app.settle()
    expect(app.main()).toContain('Renamed Cup')
    expect(callsTo('getEvents')).toBe(2)
  })
  it('a change nobody made fetches nothing again', async () => {
    app = await boot(() => {})
    await openEntered()
    await vi.advanceTimersByTimeAsync(31_000)
    document.dispatchEvent(new Event('visibilitychange'))
    await app.settle()
    expect(callsTo('getEvents')).toBe(1)
  })
  it('saving an event shows it at once', async () => {
    app = await boot(() => {})
    await openEntered()
    await app.tap('Events')
    await app.tap('+ Create your own event')
    await app.tap('#cr-ev')
    await app.type('#ev-name', 'Kept Cup')
    await app.type('#ev-date', app.db.today)
    await app.tap('[data-style="individual"]')
    await app.tap('#ev-next')
    await app.tap('[data-pick="10"]')
    await app.tap('#ev-next')
    await app.tap('#ev-next') // Save event
    await app.homeFromHere()
    await openEntered()
    expect(app.main()).toContain('Kept Cup')
  })
  it('signing in as someone else starts empty', async () => {
    app = await boot(() => {})
    await openEntered()
    app.db.session = 'u9'
    await app.homeFromHere()
    await openEntered()
    expect(callsTo('getFriends')).toBe(2)
  })
})

describe('taps that only change the view', () => {
  it('a league’s week and view switches make no request', async () => {
    app = await boot(() => {})
    await openEntered()
    await app.tap('Winter League')
    const before = app.db.calls.length
    await app.tap('[data-lgweek="1"]')
    await app.tap('[data-lgview="individual"]')
    expect(app.db.calls.slice(before)).toEqual([])
    expect(document.querySelector('[data-lgview="individual"]').getAttribute('aria-pressed')).toBe('true')
  })
  it('showing declined competitions makes no request', async () => {
    app = await boot(() => {})
    await app.tap('Competition')
    await app.tap('[data-tab="events"]')
    await app.tap('[data-nothanks="1"]')
    const before = app.db.calls.length
    await app.tap('Declined (1)')
    expect(app.db.calls.slice(before)).toEqual([])
    expect(app.main()).toContain('Hide declined')
  })
})

describe('the club office iPad', () => {
  it('office pages don’t refetch what’s waiting, until someone asks to join', async () => {
    app = await boot(db => { db.asOffice = true; db.joins.push({ id: 1, name: 'Sean Byrne', email: 'sean@example.invalid', createdAt: '2026-10-09T10:00:00Z' }) })
    await app.tap('[data-ov="members"]')
    await app.tap('[data-ov="tee"]')
    await app.tap('[data-ov="today"]')
    expect(callsTo('getAccessRequests')).toBe(1)
    app.db.joins.push({ id: 2, name: 'Aoife Kelly', email: 'aoife@example.invalid', createdAt: '2026-10-10T08:00:00Z' })
    app.db.stamps.requests = '2'
    await vi.advanceTimersByTimeAsync(31_000)
    await app.tap('[data-ov="today"]')
    await app.settle()
    expect(app.main()).toContain('Aoife Kelly')
  })
})
