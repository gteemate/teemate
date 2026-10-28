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
  it('a page left open picks up someone else’s change by itself (the office iPad)', async () => {
    app = await boot(db => { db.asOffice = true })
    await app.tap('[data-ov="comps"]')
    const e = app.db.events.find(x => app.main().includes(x.name))
    e.name = 'Renamed Cup' // someone else's change
    app.db.stamps.events = '2'
    await vi.advanceTimersByTimeAsync(31_000) // nobody touches the iPad
    await app.settle()
    expect(app.main()).toContain('Renamed Cup')
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

describe('found in review', () => {
  it('the Course tab fetches today’s pins once, however many holes you look at', async () => {
    app = await boot(db => db.book(0, db.slotsOn(db.today).find(x => x.time === 570).id, [10, 12, 9]))
    await app.tap('Scoring')
    await app.tap('09:30')
    if (app.screen() === 'Scoring round?') await app.tap('#start')
    if (document.getElementById('gdone')) await app.tap('#gdone')
    await app.tap('[data-rt="course"]')
    await app.tap('#next')
    await app.tap('#next')
    expect(callsTo('getPins')).toBe(1)
  })
  it('a background check leaves an open pop-up and what’s typed in it alone', async () => {
    app = await boot(db => { db.asOffice = true })
    await app.tap('[data-ov="members"]')
    await app.tap('#o-add')
    const field = document.querySelector('#modal input')
    field.value = 'Half typed'
    field.focus()
    app.db.stamps.members = '2'
    await vi.advanceTimersByTimeAsync(31_000)
    document.dispatchEvent(new Event('visibilitychange'))
    await app.settle()
    expect(document.querySelector('#modal input')?.value).toBe('Half typed')
  })
})

describe('team colours', () => {
  it('teams pick from colours you can see, not a free colour picker', async () => {
    app = await boot(() => {})
    await app.tap('Competition')
    await app.tap('Events')
    await app.tap('+ Create your own event')
    await app.tap('#cr-ev')
    await app.type('#ev-name', 'Colour Cup')
    await app.type('#ev-date', app.db.today)
    await app.tap('[data-style="ryder"]')
    await app.tap('#ev-next')
    for (const id of [10, 12, 9]) await app.tap(`[data-pick="${id}"]`)
    await app.tap('#ev-next')
    expect(document.querySelector('input[type="color"]')).toBeNull()
    await app.tap('[data-col="A:#E8C547"]')
    await app.tap('#ev-bal')
    await app.tap('#ev-next')
    await app.tap('[data-draw="1"]')
    await app.tap('#ev-next')
    await app.tap('#ev-next')
    expect(app.db.events.find(x => x.name === 'Colour Cup')).toMatchObject({ A: { col: '#E8C547' }, B: { col: '#E5484D' } })
  })
})

describe('tidy: the pretend server behaves like the real one', () => {
  it('saved team colours come back visible and different', async () => {
    app = await boot(db => { db.events.push({ id: 950, name: 'Old Colours', A: { name: 'Navy', col: '#19335a' }, B: { name: 'Royal', col: '#2a4a8a' }, club: false, everyone: false,
      startDate: db.today, days: 1, style: 'ryder', fmt: 'bbl', entryRequired: true, players: [0, 9], team: { 0: 'A', 9: 'B' }, matches: { 1: [{ a: [0], b: [9] }] }, createdBy: { id: 0, name: 'Gary Cochrane' } }) })
    await app.tap('Competition'); await app.tap('[data-tab="entered"]'); await app.tap('Old Colours')
    const tug = [...document.querySelectorAll('.tug i')].map(i => i.style.background)
    expect(tug[0]).not.toBe(tug[1])
    expect(tug.join(' ')).not.toMatch(/25, 51, 90|19335a/i)
  })
})

describe('found in use: entering a pairs competition with a partner who has already entered', () => {
  it('says so in the sheet (not behind it), and you can pick someone else', async () => {
    // An ordinary member (who can't see other people's entries); Declan is already in with Ciarán.
    app = await boot(db => { db.members[0].admin = false; db.signupEntries.push({ id: 77, compId: 2, memberId: 3, partnerId: 1 }) })
    await app.tap('Competition')
    await app.tap('Events')
    await app.tap('[data-sign="2"]')
    await app.tap('Declan Murphy')
    await app.tap('Enter as a pair')
    expect(document.getElementById('sg-err')?.textContent).toContain('Declan Murphy is already entered')
    expect(document.getElementById('sg-go').disabled).toBe(false)
    await app.tap('Not now')
  })
})
