// @vitest-environment happy-dom
// A team league open for sign-up, from the club office: saved straight away with nobody in; once entries are in, a
// yellow box leads to the draw, Captains first (picked from candidates or at random from everyone), then the teams
// balanced by handicap; once it's under way, only the holes stay out (the rest under Other settings). Pretend server.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { boot } from './driver.js'

vi.mock('../../api.js', async () => (await import('./fake-api.js')).mockModule())

let app
afterEach(() => { app?.done(); app = null })

// Frosty League: 2 teams of 3, 6 places, starting 7 Dec; entries close 30 Nov (the test day is Sat 10 Oct).
const league = (o = {}) => db => {
  db.asOffice = true
  db.events.push({ id: 880, name: 'Frosty League', style: 'league', fmt: 'beststab', club: true, everyone: false, startDate: '2026-12-07', days: 1, weeks: 10, bestOf: 4,
    teams: [{ name: 'Blues', col: '#6CB6FF', size: 3 }, { name: 'Reds', col: '#E5484D', size: 3 }], team: {}, players: [1, 2, 3, 4, 5, 6], matches: {}, captainPool: [],
    signup: true, advertiseFrom: '2026-10-01', entriesClose: '2026-11-30', maxEntries: 6, createdBy: { id: 0, name: 'Gary Cochrane' }, ...o })
}
const open = async () => { await app.tap('[data-ov="comps"]'); await app.tap('[data-o-comp="e:880"]') }
const ev = () => app.db.events.find(e => e.id === 880)
const toSave = async () => { for (let i = 0; i < 4 && !document.getElementById('ev-next').textContent.startsWith('Save'); i++) await app.tap('#ev-next'); await app.tap('#ev-next') }

describe('a sign-up league: entries in, then captains and the draw', () => {
  it('full: a yellow box; captains come first; drawn at random from all entrants, then the teams balanced and saved', async () => {
    app = await boot(league())
    await open()
    expect(document.querySelector('.ogold').textContent).toContain('Entries are in: 6 of 6')
    await app.tap('Pick captains and make the draw')
    expect(document.querySelector('[data-team="-2"]').getAttribute('aria-pressed')).toBe('true')
    expect(app.text()).toContain('Captains: one for each of the 2 teams')
    await app.tap('[data-capmode="random"]')
    await app.tap('#lg-draw')
    await app.tap('Next: balance the teams')
    await app.tap('#lg-bal')
    await toSave()
    const e = ev()
    expect(e.teams.every(t => e.players.includes(t.captain))).toBe(true)
    expect(Object.keys(e.team)).toHaveLength(6)
    expect(e.teams.map((t, k) => e.team[t.captain] === k)).toEqual([true, true]) // captains stay with their teams
  })
  it('or pick candidates: only they can be drawn', async () => {
    app = await boot(league())
    await open()
    await app.tap('Pick captains and make the draw')
    expect(document.querySelectorAll('[data-cand]')).toHaveLength(6) // a sign-up league's candidates are its entrants
    await app.tap('[data-cand="2"]'); await app.tap('[data-cand="5"]')
    await app.tap('#lg-draw')
    await app.tap('Next: balance the teams'); await app.tap('#lg-bal')
    await toSave()
    expect(ev().teams.map(t => t.captain).sort()).toEqual([2, 5])
  })
  it('no box while there’s room and entries are open, nor once the teams are drawn', async () => {
    app = await boot(league({ players: [1, 2, 3] }))
    await open()
    expect(document.querySelector('.ogold')).toBe(null)
    app.done(); app = await boot(league({ team: { 1: 0, 2: 1 } }))
    await open()
    expect(document.querySelector('.ogold')).toBe(null)
  })
  it('entries closed but not full: the box too', async () => {
    app = await boot(league({ players: [1, 2, 3, 4], entriesClose: '2026-10-09' }))
    await open()
    expect(document.querySelector('.ogold').textContent).toContain('Entries are in: 4 of 6')
  })
  it('the office can’t add past the places', async () => {
    app = await boot(league())
    await open()
    await app.tap('Pick captains and make the draw')
    await app.tap('[data-team="-1"]')
    expect(app.text()).toContain('Full: 6 of 6 places')
    expect(document.getElementById('lg-addall')).toBe(null)
    await app.tap('[data-ent="7"]')
    expect(app.toast()).toContain('Full: 6 places')
    expect(document.querySelector('[data-ent="7"]').getAttribute('aria-pressed')).toBe('false')
  })
})

describe('unfinished league cards, for the office', () => {
  const played = db => {
    league({ startDate: '2026-10-01', signup: false, team: { 1: 0, 2: 0, 3: 1 } })(db)
    db.rounds.push({ id: 871, date: '2026-10-09', lineup: [{ m: 1 }, { m: 2 }], scores: Array.from({ length: 18 }, () => [4, 4]), done: Array.from({ length: 18 }, (_, i) => i < 3), updated_at: '2026-10-09T12:00:00Z' },
      { id: 872, date: '2026-10-08', lineup: [{ m: 3 }], scores: Array.from({ length: 18 }, () => [4]), done: Array(18).fill(true), updated_at: '2026-10-08T12:00:00Z' })
    db.leagueEntries.push({ eventId: 880, week: 2, memberId: 1, roundId: 871 }, { eventId: 880, week: 2, memberId: 2, roundId: 871 }, { eventId: 880, week: 2, memberId: 3, roundId: 872 })
  }
  it('lists only the cards not finished, with the week, day and how far they got', async () => {
    app = await boot(played)
    await open()
    const rows = [...document.querySelectorAll('[data-o-lgout]')].map(b => b.dataset.oLgout)
    expect(rows).toEqual(['1:2', '2:2']) // Ciarán's finished card isn't listed
    expect(document.querySelector('.odetail').textContent).toContain('Unfinished cards · 2')
    expect(document.querySelector('.odetail').textContent).toContain('Week 2 · Fri 9 Oct · thru 3 of 18')
  })
  it('none unfinished: no section', async () => {
    app = await boot(db => { played(db); db.rounds[db.rounds.length - 2].done = Array(18).fill(true) })
    await open()
    expect(document.querySelector('[data-o-lgout]')).toBe(null)
  })
})

describe('league settings', () => {
  it('a new league: League comes before Holes; with sign-up on, Save event straight away', async () => {
    app = await boot(db => { db.asOffice = true })
    await app.tap('[data-ov="comps"]'); await app.tap('#o-new'); await app.tap('[data-o-kind="league"]')
    const heads = [...document.querySelectorAll('.evsec h4')].map(h => h.textContent)
    expect(heads.indexOf('League')).toBeLessThan(heads.indexOf('Holes'))
    expect(heads.indexOf('Event')).toBeLessThan(heads.indexOf('League'))
    expect(document.getElementById('ev-next').textContent).toContain('Next')
    await app.tap('#ev-signup')
    expect(document.getElementById('ev-next').textContent).toBe('Save event')
  })
  it('under way: only the holes are out; the rest folds under Other settings, and still saves', async () => {
    app = await boot(league({ team: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1, 6: 1 } }))
    await open()
    await app.tap('[data-o-go="edit:880"]')
    const first = document.querySelector('.screen .evsec')
    expect(first.querySelector('h4').textContent).toBe('Holes')
    const more = document.querySelector('details.evmore')
    expect(more.open).toBe(false)
    expect(more.querySelector('summary').textContent).toContain('Other settings')
    expect(more.querySelector('#ev-name')).not.toBe(null)
    await app.tap('[data-hpq="ev:front"]')
    await toSave()
    expect(ev().holes).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(ev().name).toBe('Frosty League')
  })
})

describe('office: a sign-up competition’s own page', () => {
  it('Entries and settings, then Back: to Competitions, not a second list', async () => {
    app = await boot(db => { db.asOffice = true })
    await app.tap('[data-ov="comps"]'); await app.tap('[data-o-comp="s:1"]')
    await app.tap('Entries and settings')
    expect(app.text()).not.toContain('Sign-up competitions')
    await app.tap('#back')
    expect(document.querySelector('.office h1, .oh1, #hdr h2')?.textContent ?? app.text()).toContain('Competitions')
    expect(document.querySelector('[data-o-comp="s:1"]')).not.toBe(null)
  })
  it('New competition → a sign-up one: its own page; saved, back to Competitions', async () => {
    app = await boot(db => { db.asOffice = true })
    await app.tap('[data-ov="comps"]'); await app.tap('#o-new'); await app.tap('[data-o-kind="signup"]')
    expect(app.text()).not.toContain('Season competitions members enter in advance')
    await app.type('#sc-name', 'Spring Singles')
    await app.tap('Add')
    expect(app.db.signups.some(c => c.name === 'Spring Singles')).toBe(true)
    expect(document.querySelector('[data-o-comp]')).not.toBe(null)
  })
})

describe('a surname letter bar on long entry lists', () => {
  const many = db => { for (let i = 0; i < 20; i++) db.members.push({ id: 200 + i, name: `Pat Zane${i}`, gui: null, hcp: 10, admin: false, hutStaff: false, playsIn: 'men' }) }
  it('over 25 entrants: tap a letter for just those surnames', async () => {
    app = await boot(db => { many(db); league({ players: [...Array(13).keys(), ...Array.from({ length: 20 }, (_, i) => 200 + i)], maxEntries: 40 })(db) })
    await open()
    await app.tap('[data-o-ents="880"]')
    expect(document.querySelector('.oaz')).not.toBe(null)
    await app.tap('[data-az="ents880:Z"]')
    expect(document.querySelectorAll('[data-o-rment]')).toHaveLength(20)
  })
  it('25 or fewer: no letters', async () => {
    app = await boot(league())
    await open()
    await app.tap('[data-o-ents="880"]')
    expect(document.querySelector('.oaz')).toBe(null)
  })
})
