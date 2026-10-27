// @vitest-environment happy-dom
// Journeys for the rest of the features: making each kind of event and seeing its leaderboard after a round,
// sending and declining a challenge, and the smaller jobs (pins, club name and colours, hut orders, guest handicaps,
// friends, password). Pretend server, like journeys.test.js; tap counts go into the click report.
import { describe, it, expect, vi, afterEach, afterAll } from 'vitest'
import { writeFileSync } from 'node:fs'
import { boot } from './driver.js'

vi.mock('../../api.js', async () => (await import('./fake-api.js')).mockModule())

let app
const tapLog = []
// After every journey: back to Home from wherever it ended (fails if a screen has no way back or goes round in
// circles), counting the presses; taps, screens and presses go into the click report.
afterEach(async ctx => {
  if (!app) return
  const ok = ctx.task.result?.state !== 'fail'
  let presses = null
  try {
    if (ok && !app.db?.asOffice) { if (app.screen() !== 'Home') await app.homeFromHere(); presses = app.backPresses ?? 0 }
  } finally {
    tapLog.push({ journey: ctx.task.name, taps: app.taps, screens: [...new Set(app.visited)].length, back: presses, ok })
    app.done(); app = null
  }
})
afterAll(() => { if (process.env.TAP_REPORT) writeFileSync(process.env.TAP_REPORT.replace(/\.json$/, '-features.json'), JSON.stringify(tapLog, null, 1)) })

const at = (db, time) => db.slotsOn(db.today).find(s => s.time === time)
const fourBall = db => db.book(0, at(db, 570).id, [10, 12, 9]) // Gary's 09:30 with Tom, Orla and Eoin (in no events)

// Make an event for today from Competitions → Events → Create your own event.
async function makeEvent(style, name, players) {
  await app.tap('Competition')
  await app.tap('Events')
  await app.tap('+ Create your own event')
  await app.tap('#cr-ev')
  await app.type('#ev-name', name)
  await app.type('#ev-date', app.db.today)
  await app.tap(`[data-style="${style}"]`)
  await app.tap('#ev-next')
  for (const id of players) await app.tap(`[data-pick="${id}"]`)
  await app.tap('#ev-next')
  if (style !== 'individual') { await app.tap('#ev-bal'); await app.tap('#ev-next') } // teams: auto-balance
  if (style === 'ryder') { await app.tap('[data-draw="1"]'); await app.tap('#ev-next') } // the draw
  await app.tap('#ev-next') // Review → Save event
  const e = app.db.events.find(x => x.name === name)
  expect(e).toMatchObject({ style, startDate: app.db.today })
  return e
}
// Play the round on the four-ball's card, counting it for the event, then open the event's leaderboard.
async function playFor(eventName) {
  await app.homeFromHere()
  await app.tap('Scoring')
  await app.tap('09:30')
  if (app.screen() === 'Scoring round?') {
    const tick = [...document.querySelectorAll('[data-k]')].find(b => b.textContent.includes(eventName))
    if (tick && tick.getAttribute('aria-pressed') !== 'true') await app.tap(`[data-k="${tick.dataset.k}"]`)
    if (document.querySelector('[data-mk]')) await app.tap('[data-mk="0"]') // a marker, if it needs one
    await app.tap('#start')
  }
  if (document.getElementById('gdone')) await app.tap('#gdone')
  for (let h = 0; h < 18 && !document.getElementById('submit'); h++) {
    if (h % 3 === 0) await app.tap('[data-k="0"][data-d="-1"]') // Gary birdies every third hole
    await app.tap('#save')
  }
  await app.tap('#submit')
}

describe('events: make each kind, play it, see the leaderboard', () => {
  it('Individual Stableford for my group today: set up, play 18 on one card, the leaderboard has everyone', async () => {
    app = await boot(fourBall)
    const e = await makeEvent('individual', 'Saturday Swindle', [10, 12, 9])
    await playFor('Saturday Swindle')
    await app.homeFromHere()
    await app.tap('Competition')
    await app.tap('[data-tab="entered"]')
    await app.tap('Saturday Swindle')
    for (const name of ['Gary Cochrane', 'Tom Byrne', 'Orla Ryan', 'Eoin Fitzgerald']) expect(app.main()).toContain(name)
    expect([...e.players].sort((a, b) => a - b)).toEqual([0, 9, 10, 12])
  })
  it('Team Stableford: set up two balanced teams, play, the board shows both teams', async () => {
    app = await boot(fourBall)
    const e = await makeEvent('teams', 'Fourball Feud', [10, 12, 9])
    await playFor('Fourball Feud')
    await app.homeFromHere()
    await app.tap('Competition')
    await app.tap('[data-tab="entered"]')
    await app.tap('Fourball Feud')
    expect(app.main()).toContain(e.A.name)
    expect(app.main()).toContain(e.B.name)
  })
  it('Four-ball team match play: teams, the draw, play the match on one card, the board shows the match result', async () => {
    app = await boot(fourBall)
    const e = await makeEvent('ryder', 'Cats v Dogs', [10, 12, 9])
    expect(e.matches[1]).toHaveLength(1) // one four-ball match on the day
    await playFor('Cats v Dogs')
    await app.homeFromHere()
    await app.tap('Competition')
    await app.tap('[data-tab="entered"]')
    await app.tap('Cats v Dogs')
    expect(app.main()).toMatch(/won|up|AS|Halved/)
  })
})

// A season Gary runs: started 3 days ago (day 1 played: a four-ball), Blues 0, 9, 11 v Reds 10, 12, 1, ends 31 Mar.
const pals = db => db.events.push({ id: 900, name: 'Pals Season', A: { name: 'Blues', col: '#19335A' }, B: { name: 'Reds', col: '#762A43' },
  club: false, everyone: false, startDate: '2026-10-07', days: 176, season: true, style: 'ryder', fmt: 'bbl', entryRequired: true,
  players: [0, 9, 11, 10, 12, 1], team: { 0: 'A', 9: 'A', 11: 'A', 10: 'B', 12: 'B', 1: 'B' },
  matches: { 1: [{ a: [0, 9], b: [10, 12] }] }, createdBy: { id: 0, name: 'Gary Cochrane' } })
// …with day 1 played on one card (the Blues win every hole) and a singles to come on 12 Oct (Quinn v Murphy).
const palsPlayed = db => {
  pals(db)
  const e = db.events.at(-1)
  e.matches[6] = [{ a: [11], b: [1] }]
  db.rounds.push({ id: 950, date: '2026-10-07', lineup: [{ m: 0 }, { m: 9 }, { m: 10 }, { m: 12 }], scores: Array.from({ length: 18 }, () => [3, 4, 4, 4]),
    done: Array(18).fill(true), updated_at: '2026-10-07T12:00:00Z' })
  for (const m of [0, 9, 10, 12]) db.entries.push({ eventId: 900, day: 1, memberId: m, roundId: 950 })
}
async function openSeasonBoard() {
  await app.tap('Competition')
  await app.tap('[data-tab="entered"]')
  await app.tap('Pals Season')
}
async function openSeasonEditor() {
  await app.tap('Competition')
  await app.tap('[data-tab="entered"]')
  await app.tap('[data-edit="900"]')
}

describe('four-ball team match play over a season', () => {
  it('set up a season with an end date and no match days yet', async () => {
    app = await boot(() => {})
    await app.tap('Competition')
    await app.tap('Events')
    await app.tap('+ Create your own event')
    await app.tap('#cr-ev')
    await app.type('#ev-name', 'Ballymena v Coleraine')
    await app.type('#ev-date', app.db.today)
    await app.tap('[data-style="ryder"]')
    await app.tap('[data-when="season"]')
    await app.type('#ev-end', '2027-03-31')
    await app.tap('#ev-next')
    for (const id of [10, 12, 9]) await app.tap(`[data-pick="${id}"]`)
    await app.tap('#ev-next')
    await app.tap('#ev-bal')
    await app.tap('#ev-next') // Teams → Match days
    expect(app.main()).toContain('+ Add a match day')
    await app.tap('#ev-next') // Match days → Review
    expect(app.main()).toContain('Season')
    await app.tap('#ev-next') // Save event
    const e = app.db.events.find(x => x.name === 'Ballymena v Coleraine')
    expect(e).toMatchObject({ season: true, days: 173, matches: {} })
  })
  it('the organiser adds a match day with a four-ball and a singles', async () => {
    app = await boot(pals)
    await openSeasonEditor()
    for (let i = 0; i < 3; i++) await app.tap('#ev-next') // Details → Players → Teams → Match days
    await app.tap('#md-new')
    await app.type('#ev-md', '2026-10-17')
    await app.tap('#ev-mdadd') // Date → Players
    await app.tap('#ev-next') // Players → Matches
    await app.tap('[data-add4="11"]')
    await app.tap('[data-add1="11"]')
    for (let i = 0; i < 3; i++) await app.tap('#ev-next') // Matches → Holes → Points → Confirm
    await app.tap('#ev-next') // Add match day
    await app.tap('#ev-next') // Review
    await app.tap('#ev-next') // Save changes
    const e = app.db.events.find(x => x.id === 900)
    expect(e.matches[11]).toHaveLength(2)
    expect(e.matches[11].filter(m => m.a.length === 1)).toHaveLength(1)
    expect(e.matches[1]).toEqual([{ a: [0, 9], b: [10, 12] }]) // the played day as it was
  })
  it('the guided flow: who’s playing, a 3-ball, the front 9, the day’s points', async () => {
    app = await boot(pals)
    await openSeasonBoard()
    await app.tap('+ Add a match day')
    await app.type('#ev-md', '2026-10-17')
    await app.tap('#ev-mdadd') // Players
    await app.tap('[data-mdp="11"]') // Liam's out
    await app.tap('#ev-next') // Matches
    await app.tap('[data-add3="B"]') // a Reds pair against a Blue
    await app.tap('#ev-next') // Holes
    await app.tap('[data-hpq="md:front"]')
    await app.tap('#ev-next') // Points
    await app.tap('[data-mdpt="threeSingle"][data-d="1"]')
    await app.tap('[data-mdpt="threeSingle"][data-d="1"]') // the single's win worth 3 (up in halves)
    expect(app.main()).toContain('1 match · 3 points available')
    await app.tap('#ev-next') // Confirm
    expect(app.main()).toContain('Holes 1–9')
    await app.tap('#ev-next') // Add match day
    await app.tap('#ev-next') // Review
    await app.tap('#ev-next') // Save changes
    const e = app.db.events.find(x => x.id === 900)
    expect(e.matches[11]).toHaveLength(1)
    expect(e.matches[11][0].b).toEqual(expect.arrayContaining([10, 12]))
    expect(e.matches[11][0].a).toHaveLength(1)
    expect(e.matches[11][0].a).not.toContain(11)
    expect(e.dayRules[11]).toEqual({ holes: [1, 2, 3, 4, 5, 6, 7, 8, 9], points: { four: 1, singles: 1, threePair: 1, threeSingle: 3 } })
  })
  it('points for each match type are set when the event is made', async () => {
    app = await boot(() => {})
    await app.tap('Competition')
    await app.tap('Events')
    await app.tap('+ Create your own event')
    await app.tap('#cr-ev')
    await app.type('#ev-name', 'Points Cup')
    await app.type('#ev-date', app.db.today)
    await app.tap('[data-style="ryder"]')
    await app.tap('[data-pt="four"][data-d="1"]')
    await app.tap('[data-pt="four"][data-d="1"]')
    await app.tap('#ev-next')
    for (const id of [10, 12, 9]) await app.tap(`[data-pick="${id}"]`)
    await app.tap('#ev-next')
    await app.tap('#ev-bal')
    await app.tap('#ev-next')
    await app.tap('#ev-next')
    await app.tap('#ev-next')
    expect(app.db.events.find(x => x.name === 'Points Cup').points).toEqual({ four: 2, singles: 1, threePair: 1, threeSingle: 2 })
  })
  it('a one-off event’s day is set up with the same flow (two singles)', async () => {
    app = await boot(() => {})
    await app.tap('Competition')
    await app.tap('Events')
    await app.tap('+ Create your own event')
    await app.tap('#cr-ev')
    await app.type('#ev-name', 'Singles Day')
    await app.type('#ev-date', app.db.today)
    await app.tap('[data-style="ryder"]')
    await app.tap('#ev-next')
    for (const id of [10, 12, 9]) await app.tap(`[data-pick="${id}"]`)
    await app.tap('#ev-next')
    await app.tap('#ev-bal')
    await app.tap('#ev-next') // Draw (day 1 drawn already)
    await app.tap('[data-mdset="1"]')
    await app.tap('#ev-next') // Players → Matches
    await app.tap('[data-rmm="1:0"]') // take out the drawn four-ball
    await app.tap('[data-add1="1"]')
    await app.tap('[data-add1="1"]')
    for (let i = 0; i < 4; i++) await app.tap('#ev-next') // Holes, Points, Confirm, Save match day
    await app.tap('#ev-next') // Review
    await app.tap('#ev-next') // Save event
    expect(app.db.events.find(x => x.name === 'Singles Day').matches[1].map(m => m.a.length + m.b.length)).toEqual([2, 2])
  })
  it('the board: season score, match days newest first, a singles one a side, the organiser’s buttons', async () => {
    app = await boot(palsPlayed)
    await openSeasonBoard()
    const t = app.main()
    expect(t).toContain('Season ends')
    expect(t).toContain('1 match played · 1 to come')
    // The drop-down opens on the next match day (none today): the singles on 12 Oct.
    expect(document.getElementById('ev-mday').value).toBe('6')
    expect(t).toContain('Quinn')
    expect(t).toContain('Murphy')
    expect(t).not.toMatch(/Blues \d&\d/)
    expect(document.querySelector('[data-mday="6"] .mside').textContent).not.toContain('&')
    expect(t).toContain('+ Add a match day')
    // Choosing the played day shows its result, with no trip to the server.
    const before = app.db.calls.length
    const sel = document.getElementById('ev-mday'); sel.value = '1'; sel.dispatchEvent(new Event('change')); await app.settle()
    expect(app.main()).toMatch(/Blues \d&\d/)
    expect(app.db.calls.slice(before).filter(c => !['getSession', 'getMe'].includes(c))).toEqual([])
    await app.tap('+ Add a match day')
    expect(document.getElementById('ev-md')).not.toBeNull() // the editor, in the add-a-match-day flow
    await app.tap('#back') // out of the flow, back on Match days
    await app.tap('#ev-next')
    await app.tap('#ev-next')
  })
  it('a 3-ball’s card says what each side gets for a win', async () => {
    app = await boot(db => { palsPlayed(db); db.events.at(-1).matches[6].push({ a: [0, 9], b: [10] }) })
    await openSeasonBoard()
    expect(app.main()).toContain('3-ball · 1 / 2 pts')
    expect(app.main()).toContain('Singles · 1 pt')
  })
  it('found in review: a 3-ball’s page is headed 3-ball, and a halved 3-ball shares the points it was worth', async () => {
    app = await boot(db => {
      palsPlayed(db); const e = db.events.at(-1)
      e.fmt = 'bbscr' // scratch, so level scores are a halve
      e.matches[1] = [{ a: [0, 9], b: [10] }]
      db.rounds.find(r => r.id === 950).lineup = [{ m: 0 }, { m: 9 }, { m: 10 }]
      db.rounds.find(r => r.id === 950).scores = Array.from({ length: 18 }, () => [4, 4, 4])
      db.entries.splice(0, db.entries.length, ...[0, 9, 10].map(m => ({ eventId: 900, day: 1, memberId: m, roundId: 950 })))
    })
    await openSeasonBoard()
    const sel = document.getElementById('ev-mday'); sel.value = '1'; sel.dispatchEvent(new Event('change')); await app.settle()
    expect(app.main()).toContain('½ – 1 pts')
    await app.tap('[data-mday="1"]')
    expect(app.text()).toContain('3-ball')
  })
  it('found in review: Stableford total shows the running totals while it’s being played', async () => {
    app = await boot(db => {
      palsPlayed(db); db.events.at(-1).fmt = 'stabtot'
      const r = db.rounds.find(x => x.id === 950); r.done = r.done.map((_, i) => i < 9)
    })
    await openSeasonBoard()
    const sel = document.getElementById('ev-mday'); sel.value = '1'; sel.dispatchEvent(new Event('change')); await app.settle()
    expect(app.main()).toMatch(/Blues \d+ – \d+/)
    expect(app.main()).toContain('thru 9')
    expect(app.main()).not.toMatch(/\d+ up/)
  })
  it('found in review: once a season has started, the event’s points can’t change (they’d rescore played days)', async () => {
    app = await boot(pals)
    await openSeasonEditor()
    expect(document.querySelector('[data-pt="four"]').disabled).toBe(true)
    for (let i = 0; i < 5; i++) await app.tap('#ev-next')
  })
  it('found in review: one team’s colour can’t be picked for the other', async () => {
    app = await boot(() => {})
    await app.tap('Competition'); await app.tap('Events'); await app.tap('+ Create your own event'); await app.tap('#cr-ev')
    await app.type('#ev-name', 'Same Colours'); await app.type('#ev-date', app.db.today)
    await app.tap('[data-style="ryder"]'); await app.tap('#ev-next')
    for (const id of [10, 12, 9]) await app.tap(`[data-pick="${id}"]`)
    await app.tap('#ev-next')
    expect(document.querySelector('[data-col="B:#6CB6FF"]').disabled).toBe(true)
    expect(document.querySelector('[data-col="A:#E5484D"]').disabled).toBe(true)
    await app.tap('#ev-bal'); await app.tap('#ev-next'); await app.tap('#ev-next'); await app.tap('#ev-next')
  })
  it('tidy: removing a match day removes its holes and points too', async () => {
    app = await boot(db => { pals(db); Object.assign(db.events.at(-1), { startDate: '2026-10-20', days: 60, matches: { 30: [{ a: [0], b: [10] }] }, dayRules: { 30: { holes: 9 } } }) })
    await openSeasonEditor()
    for (let i = 0; i < 3; i++) await app.tap('#ev-next')
    await app.tap('[data-rmday="30"]')
    await app.tap('#ev-next'); await app.tap('#ev-next')
    expect(app.db.events.find(x => x.id === 900).dayRules?.[30]).toBeUndefined()
  })
  it('tidy: switching between one-off and season clears the day settings', async () => {
    app = await boot(db => { pals(db); Object.assign(db.events.at(-1), { startDate: '2026-10-20', days: 60, matches: { 30: [{ a: [0], b: [10] }] }, dayRules: { 30: { holes: 9 } } }) })
    await openSeasonEditor()
    await app.tap('[data-when="once"]')
    await app.tap('[data-when="season"]')
    for (let i = 0; i < 5; i++) await app.tap('#ev-next')
    expect(app.db.events.find(x => x.id === 900).dayRules ?? {}).toEqual({})
  })
  it('tidy: a 9-hole day’s match page shows just those 9 holes', async () => {
    app = await boot(db => { palsPlayed(db); db.events.at(-1).dayRules = { 1: { holes: 9 } } })
    await openSeasonBoard()
    const sel = document.getElementById('ev-mday'); sel.value = '1'; sel.dispatchEvent(new Event('change')); await app.settle()
    await app.tap('[data-mday="1"]')
    expect(document.querySelectorAll('.msh')).toHaveLength(9)
    expect([...document.querySelectorAll('.msc thead th')].map(th => th.textContent)).not.toContain('In')
  })
  it('tidy: no “1 point each” where points can differ', async () => {
    app = await boot(() => {})
    await app.tap('Competition'); await app.tap('Events'); await app.tap('+ Create your own event'); await app.tap('#cr-ev')
    expect(app.main()).not.toContain('1 point each')
    await app.type('#ev-name', 'Wording Cup'); await app.type('#ev-date', app.db.today)
    await app.tap('[data-style="ryder"]'); await app.tap('#ev-next')
    for (const id of [10, 12, 9]) await app.tap(`[data-pick="${id}"]`)
    await app.tap('#ev-next'); await app.tap('#ev-bal'); await app.tap('#ev-next'); await app.tap('#ev-next')
    expect(app.main()).not.toContain('1 point each')
    await app.tap('#ev-next')
  })
  it('cards say it’s a season, and a match page says which day', async () => {
    app = await boot(palsPlayed)
    await app.tap('Competition')
    await app.tap('[data-tab="entered"]')
    expect(app.main()).toContain('Season · ends Wed 31 Mar')
    await app.tap('Pals Season')
    await app.tap('[data-mday="6"]')
    expect(app.text()).toContain('Singles · Mon 12 Oct')
  })
  it('a player who isn’t the organiser sees the board but no organiser buttons', async () => {
    app = await boot(db => { palsPlayed(db); db.events.at(-1).createdBy = { id: 9, name: 'Eoin Fitzgerald' }; db.members[0].admin = false })
    await openSeasonBoard()
    expect(app.main()).toContain('Season ends')
    expect(app.main()).not.toContain('+ Add a match day')
  })
  it('an admin can rename a season that has started', async () => {
    app = await boot(pals)
    await openSeasonEditor()
    expect(document.getElementById('ev-name').disabled).toBe(false)
    await app.type('#ev-name', 'Pals Season 2026')
    for (let i = 0; i < 5; i++) await app.tap('#ev-next') // through to Save changes
    expect(app.db.events.find(x => x.id === 900).name).toBe('Pals Season 2026')
  })
  it('the organiser of a started season can’t change things only an admin can (team names)', async () => {
    app = await boot(db => { pals(db); db.members[0].admin = false })
    await openSeasonEditor()
    expect(document.getElementById('ev-name').disabled).toBe(true)
    await app.tap('#ev-next')
    await app.tap('#ev-next') // Teams
    expect(document.getElementById('ev-an').disabled).toBe(true)
    for (let i = 0; i < 3; i++) await app.tap('#ev-next')
  })
  it('before it starts: the end date can’t cut off a match day, and the first day can’t move under match days', async () => {
    app = await boot(db => { pals(db); Object.assign(db.events.at(-1), { startDate: '2026-10-20', days: 60, matches: { 30: [{ a: [0], b: [10] }] } }) })
    await openSeasonEditor()
    await app.type('#ev-end', '2026-11-10')
    await app.tap('#ev-next')
    expect(app.text()).toContain('after the end date')
    await app.type('#ev-end', '2026-12-18')
    await app.type('#ev-date', '2026-10-25')
    await app.tap('#ev-next')
    expect(app.text()).toContain('Remove the match days')
    await app.type('#ev-date', '2026-10-20')
    for (let i = 0; i < 5; i++) await app.tap('#ev-next')
  })
  it('a past match: no booking advice on its page', async () => {
    app = await boot(palsPlayed)
    await openSeasonBoard()
    const sel = document.getElementById('ev-mday'); sel.value = '1'; sel.dispatchEvent(new Event('change')); await app.settle()
    await app.tap('[data-mday="1"]')
    expect(app.main()).not.toContain('Book this match')
    expect(app.main()).not.toContain('Booked')
  })
  it('a singles with each of us booked with our own friends: no four-ball booking advice', async () => {
    app = await boot(db => {
      pals(db); db.events.at(-1).matches[4] = [{ a: [0], b: [10] }]
      db.book(0, at(db, 570).id, [12, 9]); db.book(10, at(db, 600).id, [11])
    })
    await openSeasonBoard()
    expect(app.main()).not.toContain('Book your match')
    expect(app.main()).not.toContain('needs all four')
  })
  it('a played match day can’t be changed, and nobody switches teams', async () => {
    app = await boot(db => { pals(db); db.members[0].admin = false })
    await openSeasonEditor()
    await app.tap('#ev-next')
    await app.tap('#ev-next') // Teams
    expect(document.querySelector('[data-tm="0"]').disabled).toBe(true)
    await app.tap('#ev-next') // Match days
    expect(document.querySelector('[data-mdset="1"]')).toBeNull()
    expect(document.querySelector('[data-rmday="1"]')).toBeNull()
    await app.tap('#ev-next') // Review
    await app.tap('#ev-next') // Save changes (nothing changed)
    expect(app.db.events.find(x => x.id === 900).team).toEqual({ 0: 'A', 9: 'A', 11: 'A', 10: 'B', 12: 'B', 1: 'B' })
  })
})

describe('challenges with other four-balls', () => {
  const twoGroups = db => { db.book(0, at(db, 570).id, [10]); db.book(7, at(db, 580).id, [11]) }
  it('send a challenge to another group on the tee sheet', async () => {
    app = await boot(twoGroups)
    await app.tap('Scoring')
    await app.tap('#pe-new')
    const other = at(app.db, 580).id
    await app.tap(`[data-inv="${other}"]`)
    await app.tap('#pe-setup')
    await app.tap('#pe-send')
    expect(app.db.playerEvents.at(-1)).toMatchObject({ status: 'pending', proposerSlot: at(app.db, 570).id, groups: [{ slot: at(app.db, 570).id }, { slot: other, answer: null }] })
  })
  it('decline a challenge from the drop-down', async () => {
    app = await boot(db => {
      const mine = db.book(0, at(db, 570).id, [1]), theirs = db.book(7, at(db, 560).id, [11])
      db.playerEvents.push({ id: 5, date: db.today, style: 'fourball', format: 'best2', status: 'pending', proposerSlot: theirs.slotId, proposedBy: { id: 7, name: 'Peter Walsh' },
        createdBy: { id: 7, name: 'Peter Walsh' }, teamNames: {}, players: [{ id: 1, memberId: 0, name: 'Gary Cochrane', slot: mine.slotId }, { id: 2, memberId: 7, name: 'Peter Walsh', slot: theirs.slotId }],
        groups: [{ slot: theirs.slotId, time: 560, host: true, answer: null }, { slot: mine.slotId, time: 570, host: false, answer: null }] })
    })
    expect(app.text()).toContain('has challenged your group')
    await app.tap('Decline')
    expect(app.db.playerEvents[0].status).toBe('cancelled')
  })
})

describe('one against one with a player in another group', () => {
  const twoGroups = db => { db.book(0, at(db, 570).id, [10]); db.book(7, at(db, 580).id, [11]) }
  it('+ Add a match → One against one → someone out today → Send challenge', async () => {
    app = await boot(twoGroups)
    await app.tap('Scoring'); await app.tap('09:30')
    if (app.screen() === 'Scoring round?') await app.tap('#start')
    await app.tap('#gname')
    await app.tap('[data-am="one"]')
    const declan = at(app.db, 580).players.find(p => p.memberId === 11)
    expect(app.text()).toContain('Out today')
    expect(document.querySelector('[data-op="t' + at(app.db, 580).players.find(p => p.memberId === 7).id + '"]')).not.toBeNull()
    expect(document.querySelector(`[data-op="t${at(app.db, 570).players.find(p => p.memberId === 10).id}"]`)).toBeNull() // on my card: listed above instead
    await app.tap(`[data-op="t${declan.id}"]`)
    await app.tap('[data-ok="sm2"]')
    expect(document.getElementById('am-go').textContent).toBe('Send challenge')
    await app.tap('#am-go')
    expect(app.toast()).toContain('Challenge sent')
    expect(app.db.playerEvents.at(-1)).toMatchObject({ style: 'singles', format: 'sm2', status: 'pending', players: [{ memberId: 0, team: 'A' }, { memberId: 11, team: 'B' }] })
    expect(app.db.rounds.at(-1)?.game ?? 'none').toBe('none') // my card stays scores only
    expect(app.text()).toMatch(/waiting for/)
  })
  it('accept a one-on-one from the drop-down: only the player asked answers', async () => {
    app = await boot(db => {
      const mine = db.book(0, at(db, 570).id, [1]), theirs = db.book(7, at(db, 560).id, [11])
      db.playerEvents.push({ id: 6, date: db.today, style: 'singles', format: 'kos', status: 'pending', proposerSlot: theirs.slotId, proposedBy: { id: 7, name: 'Peter Walsh' },
        createdBy: { id: 7, name: 'Peter Walsh' }, teamNames: { A: 'Peter Walsh', B: 'Gary Cochrane' },
        players: [{ id: 2, memberId: 7, name: 'Peter Walsh', slot: theirs.slotId, team: 'A' }, { id: 1, memberId: 0, name: 'Gary Cochrane', slot: mine.slotId, team: 'B' }],
        groups: [{ slot: theirs.slotId, time: 560, host: true, answer: 'accepted' }, { slot: mine.slotId, time: 570, host: false, answer: null }] })
    })
    expect(app.text()).toContain('has challenged you to a one-on-one')
    await app.tap('Accept')
    expect(app.db.playerEvents[0].status).toBe('accepted')
  })
})

describe('our maker’s mark', () => {
  it('MADE BY TEEMATE at the foot of Account', async () => {
    app = await boot()
    await app.tap('#account')
    expect(document.querySelector('.maker')?.textContent).toBe('MADE BY TEEMATE')
  })
  it('tapping it on Account shows our email, and Close goes back to Account', async () => {
    app = await boot()
    await app.tap('#account')
    await app.tap('#maker')
    expect(document.getElementById('mk-site')).toBeNull() // no website link until the site works
    expect(document.getElementById('mk-mail').getAttribute('href')).toMatch(/^mailto:gareth@tee-mate\.co\.uk\?subject=/)
    await app.tap('#mk-close')
    expect(document.getElementById('mkt')).toBeNull()
    expect(app.screen()).toBe('Account')
  })
})

describe('getting back Home', () => {
  it('Halfway hut opened from Account during a round: back goes back the way you came, not round in a loop', async () => {
    app = await boot(db => db.rounds.push({ id: 77, date: db.today, createdBy: 0, lineup: [{ m: 0 }, { m: 1 }], game: 'st2', pairing: 0, submitted: {},
      scores: Array.from({ length: 18 }, () => [4, 4]), done: Array.from({ length: 18 }, (_, i) => i < 11), slotId: null }))
    if (app.screen() !== 'Home') await app.homeFromHere()
    if (document.querySelector('[data-al="nothanks"]')) await app.tap('[data-al="nothanks"]') // the hut's own prompt
    await app.tap('Gary Cochrane')
    await app.tap('[data-a="hutorder"]')
    expect(app.screen()).toBe('Halfway hut')
    await app.homeFromHere() // fails if back goes round in circles
    expect(app.backPresses).toBeLessThanOrEqual(2)
  })
})

describe('the smaller jobs', () => {
  it('pins: the office sets today’s flags and the course guide shows them', async () => {
    app = await boot()
    await app.tap('Gary Cochrane')
    await app.tap('Club office')
    await app.tap('Club')
    await app.tap('Set today’s flags')
    expect(app.screen()).toBe('Pins')
    const publish = app.tappables().find(b => /publish/i.test(b.textContent))
    await app.tap(publish.id ? `#${publish.id}` : publish.textContent.trim())
    expect(app.db.pinSheet?.pins).toHaveLength(18)
  })
  it('club name and colours: the office renames the club', async () => {
    app = await boot()
    await app.tap('Gary Cochrane')
    await app.tap('Club office')
    await app.tap('Club')
    await app.tap('[data-o-open="colours"]')
    const nameBox = document.querySelector('#cl-name, #club-name, input[maxlength]')
    expect(nameBox).toBeTruthy()
    await app.type(`#${nameBox.id}`, 'Royal Portrush Test Club')
    const save = app.tappables().find(b => /save/i.test(b.textContent) && b.closest('main, #modal'))
    await app.tap(save.id ? `#${save.id}` : save.textContent.trim())
    expect(app.db.theme.name).toBe('Royal Portrush Test Club')
  })
  it('halfway hut staff: today’s order marked ready', async () => {
    app = await boot(db => { db.members[0].hutStaff = true; db.orders.push({ id: 900, memberId: 3, items: [{ id: 1, name: 'Bacon roll', qty: 1, pricePence: 450 }], totalPence: 450, note: null, status: 'sent', cancelNote: null, createdAt: new Date().toISOString(), roundId: null }) })
    await app.tap('Gary Cochrane')
    await app.tap('Halfway hut orders')
    const ready = app.tappables().find(b => /ready/i.test(b.textContent))
    await app.tap(ready.id ? `#${ready.id}` : ready.textContent.trim())
    expect(app.db.orders.find(o => o.id === 900).status).toBe('ready')
  })
  it('a guest’s handicap set on the scorecard', async () => {
    app = await boot(db => db.book(0, at(db, 570).id, [], [{ name: 'Sam Visitor', club: 'Royal Portrush' }]))
    await app.tap('Scoring')
    await app.tap('09:30')
    if (app.screen() === 'Scoring round?') await app.tap('#start')
    await app.tap('Set handicap')
    const box = document.querySelector('#modal input')
    await app.type(`#${box.id}`, '12.4')
    const save = app.tappables().find(b => /save/i.test(b.textContent) && b.closest('#modal'))
    await app.tap(save.id ? `#${save.id}` : save.textContent.trim())
    const g = Object.values(app.db.slots).flat().flatMap(s => s.players).find(p => p.name === 'Sam Visitor')
    expect(g.hcp).toBe(12.4)
  })
  it('friends: star one as a favourite, remove another', async () => {
    app = await boot()
    await app.tap('Friends')
    const star = [...document.querySelectorAll('[data-fm]')].find(b => !app.db.buddies.find(x => x.id === +b.dataset.fm)?.favourite)
    await app.tap(`[data-fm="${star.dataset.fm}"]`)
    expect(app.db.buddies.find(b => b.id === +star.dataset.fm).favourite).toBe(true)
    const gone = [...document.querySelectorAll('[data-b]')].find(b => +b.dataset.b !== +star.dataset.fm && app.db.buddies.some(x => x.id === +b.dataset.b))
    await app.tap(`[data-b="${gone.dataset.b}"]`)
    expect(app.db.buddies.some(b => b.id === +gone.dataset.b)).toBe(false)
  })
  it('change password', async () => {
    app = await boot()
    await app.tap('Gary Cochrane')
    await app.tap('Change password')
    const boxes = [...document.querySelectorAll('#modal input[type="password"]')]
    for (const b of boxes) await app.type(`#${b.id}`, 'a-new-password-1')
    await app.tap('#modal button[type="submit"]')
    expect(app.db.password).toBe('a-new-password-1')
  })
})

describe('club office: deleting a competition', () => {
  it('a sign-up competition: Delete, tap again, gone', async () => {
    app = await boot(db => { db.asOffice = true })
    await app.tap('[data-ov="comps"]')
    await app.tap('[data-o-comp="s:2"]')
    await app.tap('#o-del')
    expect(app.db.signups.some(c => c.id === 2)).toBe(true) // asks first
    await app.tap('#o-del')
    expect(app.db.signups.some(c => c.id === 2)).toBe(false)
    expect(app.main()).not.toContain('Men’s Fourball')
  })
  it('a club event: Delete, tap again, gone', async () => {
    app = await boot(db => { db.asOffice = true })
    await app.tap('[data-ov="comps"]')
    const e = app.db.events.find(x => x.club)
    await app.tap(`[data-o-comp="e:${e.id}"]`)
    await app.tap('#o-del')
    await app.tap('#o-del')
    expect(app.db.events.some(x => x.id === e.id)).toBe(false)
  })
})

describe('club office: one competition’s entries and settings', () => {
  it('opens a page for that competition only, and Back returns to Competitions', async () => {
    app = await boot(db => { db.asOffice = true; db.signupEntries.push({ id: 80, compId: 1, memberId: 3, partnerId: null }) })
    await app.tap('[data-ov="comps"]')
    await app.tap('[data-o-comp="s:1"]')
    await app.tap('Entries and settings')
    expect(app.screen()).toBe('Men’s Match Play')
    expect(document.getElementById('sc-name').value).toBe('Men’s Match Play')
    expect(app.main()).toContain('Entered (1)')
    expect(app.main()).toContain("Ciarán O'Neill")
    expect(app.main()).not.toContain('Ladies Singles') // no list of every competition
    expect(document.getElementById('ovl')).toBeNull() // a page, not a pop-up over the list
    await app.back()
    expect(app.screen()).toBe('Competitions')
  })
})

describe('the leaderboard of the day', () => {
  it('on (every day to start): Today at the club opens today’s scores', async () => {
    app = await boot()
    await app.tap('Competition'); await app.tap('[data-tab="entered"]')
    await app.tap('#field')
    expect(app.screen()).toBe('Leaderboard')
  })
  it('off today: nobody sees today’s scores', async () => {
    app = await boot(db => { db.theme.dayBoardToday = { date: db.today, on: false } })
    await app.tap('Competition'); await app.tap('[data-tab="entered"]')
    expect(document.getElementById('field')).toBeNull()
  })
  it('off on Saturdays (today is a Saturday) by the weekly setting', async () => {
    app = await boot(db => { db.theme.dayBoardDays = [0, 1, 2, 3, 4, 5] })
    await app.tap('Competition'); await app.tap('[data-tab="entered"]')
    expect(document.getElementById('field')).toBeNull()
  })
})

describe('club office: the leaderboard', () => {
  it('today’s competitions live, and today’s scores while the leaderboard of the day is on', async () => {
    app = await boot(db => { db.asOffice = true })
    await app.tap('[data-ov="board"]')
    expect(app.screen()).toBe('Leaderboard')
    expect(app.main()).toContain('Saturday Medal') // today's club competition
    expect(app.main()).toContain('Today’s scores')
  })
  it('switch it off for today: today’s scores go, the competition stays', async () => {
    app = await boot(db => { db.asOffice = true })
    await app.tap('[data-ov="board"]')
    await app.tap('[data-o-db="off"]')
    expect(app.db.theme.dayBoardToday).toEqual({ date: app.db.today, on: false })
    expect(app.main()).not.toContain('Today’s scores')
    expect(app.main()).toContain('Saturday Medal')
  })
  it('Club: untick Saturday for the leaderboard of the day', async () => {
    app = await boot(db => { db.asOffice = true })
    await app.tap('[data-ov="club"]')
    await app.tap('[data-o-dbday="6"]')
    expect(app.db.theme.dayBoardDays).toEqual([0, 1, 2, 3, 4, 5])
  })
})

describe('club office: members with no guest points left', () => {
  it('a filter shows just the members with 0 points left, and back to everyone', async () => {
    app = await boot(db => {
      db.asOffice = true
      for (const m of [3, 5]) db.guestVisits.push(...Array.from({ length: 12 }, (_, i) => ({ member: m, date: '2026-05-01', guest: `Guest ${i}`, club: 'Malone', points: 3 }))) // 36 of 36
      db.guestVisits.push({ member: 7, date: '2026-05-01', guest: 'One guest', club: 'Malone', points: 3 })
    })
    await app.tap('[data-ov="members"]')
    expect(app.labels()).toContain('No points left (2)')
    await app.tap('No points left (2)')
    const shown = [...document.querySelectorAll('[data-o-m]')].map(b => +b.dataset.oM)
    expect(shown.sort()).toEqual([3, 5])
    await app.tap('No points left (2)')
    expect(document.querySelectorAll('[data-o-m]').length).toBeGreaterThan(2)
  })
})

describe('club office: the leaderboard sections fold away', () => {
  it('today’s scores first and open; today’s competition open; the league closed for a nosey', async () => {
    app = await boot(db => { db.asOffice = true })
    await app.tap('[data-ov="board"]')
    const parts = [...document.querySelectorAll('#main details.oboard')].map(d => [d.querySelector('summary b').textContent.trim(), d.open])
    expect(parts[0]).toEqual(['Today’s scores', true])
    expect(parts.find(p => p[0].startsWith('Saturday Medal'))?.[1]).toBe(true)
    expect(parts.find(p => p[0].startsWith('Winter League'))?.[1]).toBe(false)
  })
  it('opened or closed stays that way when the page redraws', async () => {
    app = await boot(db => { db.asOffice = true })
    await app.tap('[data-ov="board"]')
    const league = [...document.querySelectorAll('#main details.oboard')].find(d => d.textContent.includes('Winter League'))
    league.open = true; league.dispatchEvent(new Event('toggle'))
    await app.tap('[data-ov="today"]'); await app.tap('[data-ov="board"]')
    expect([...document.querySelectorAll('#main details.oboard')].find(d => d.textContent.includes('Winter League')).open).toBe(true)
  })
})

describe('club office: finding a member and adding one', () => {
  const surname = n => n.trim().split(/\s+/).pop()[0].toUpperCase()
  it('a letter shows only the members whose surname starts with it; All shows everyone again', async () => {
    app = await boot(db => { db.asOffice = true })
    await app.tap('[data-ov="members"]')
    const all = document.querySelectorAll('[data-o-m]').length
    const letters = [...document.querySelectorAll('[data-o-az]')]
    expect(letters.map(b => b.dataset.oAz)).toEqual(['', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'])
    const used = letters.find(b => b.dataset.oAz && !b.disabled)
    expect(letters.some(b => b.disabled)).toBe(true) // letters nobody's surname starts with can't be tapped
    await app.tap(`[data-o-az="${used.dataset.oAz}"]`)
    const names = [...document.querySelectorAll('[data-o-m] .ot b')].map(b => b.textContent.replace(' (you)', ''))
    expect(names.length).toBeGreaterThan(0)
    expect(names.length).toBeLessThan(all)
    expect(names.every(n => surname(n) === used.dataset.oAz)).toBe(true)
    expect(document.querySelector(`[data-o-az="${used.dataset.oAz}"]`).getAttribute('aria-pressed')).toBe('true')
    await app.tap('[data-o-az=""]')
    expect(document.querySelectorAll('[data-o-m]').length).toBe(all)
  })
  it('Add a member opens as a small box, not the full side panel', async () => {
    app = await boot(db => { db.asOffice = true })
    await app.tap('[data-ov="members"]')
    await app.tap('#o-add')
    expect(document.querySelector('#modal .opanelwrap').classList.contains('small')).toBe(true)
    await app.tap('#opx')
    await app.tap('[data-o-m]')
    expect(document.querySelector('#modal .opanelwrap').classList.contains('small')).toBe(false)
  })
})

describe('open holes: tap each hole that’s open', () => {
  const start = async name => {
    await app.tap('Competition'); await app.tap('Events'); await app.tap('+ Create your own event'); await app.tap('#cr-ev')
    await app.type('#ev-name', name)
    await app.tap('[data-style="individual"]')
  }
  const finish = async () => { await app.tap('#ev-next'); await app.tap('[data-pick="10"]'); await app.tap('[data-pick="12"]'); await app.tap('#ev-next') }
  it('closing holes 7–9 and 13–18 leaves 1–6 and 10–12, shown on the review and saved', async () => {
    app = await boot()
    await start('Short Course Cup')
    for (const n of [7, 8, 9, 13, 14, 15, 16, 17, 18]) await app.tap(`[data-hp="ev:${n}"]`)
    expect(document.querySelector('[data-hpick="ev"] .hpcount').textContent).toBe('9 holes open: 1–6, 10–12')
    await finish()
    expect(app.main()).toContain('Holes 1–6, 10–12')
    await app.tap('#ev-next') // Save event
    expect(app.db.events.find(e => e.name === 'Short Course Cup').holes).toEqual([1, 2, 3, 4, 5, 6, 10, 11, 12])
  })
  it('Back 9, then All 18: saved as all 18', async () => {
    app = await boot()
    await start('All Holes Cup')
    await app.tap('[data-hpq="ev:back"]')
    expect(document.querySelector('[data-hpick="ev"] .hpcount').textContent).toBe('9 holes open: 10–18')
    await app.tap('[data-hpq="ev:all"]')
    await finish(); await app.tap('#ev-next')
    expect(app.db.events.find(e => e.name === 'All Holes Cup').holes).toBe(null)
  })
  it('with every hole closed you can’t go on', async () => {
    app = await boot()
    await start('No Holes Cup')
    await app.tap('[data-hpq="ev:front"]')
    for (let n = 1; n <= 9; n++) await app.tap(`[data-hp="ev:${n}"]`)
    expect($ev('#ev-next').disabled).toBe(true)
    expect($ev('#ev-next').textContent).toBe('Open at least one hole')
  })
  it('a two-day event: day 2 on its own holes', async () => {
    app = await boot()
    await start('Two Day Cup')
    await app.tap('[data-days="2"]')
    await app.tap('[data-evhd="2"]')
    await app.tap('[data-hpq="d2:front"]')
    for (let n = 4; n <= 9; n++) await app.tap(`[data-hp="d2:${n}"]`)
    expect(app.main()).toContain('Holes 1–3')
    await finish()
    expect(app.main()).toContain('All 18 · day 2: holes 1–3')
    await app.tap('#ev-next')
    expect(app.db.events.find(e => e.name === 'Two Day Cup').dayRules).toEqual({ 2: { holes: [1, 2, 3] } })
  })
})
const $ev = sel => document.querySelector(sel)
describe('open holes: shown wherever the event is described', () => {
  it('the club office’s list and detail say which holes', async () => {
    app = await boot(db => { db.asOffice = true; const e = db.events.find(x => x.club && x.style !== 'league'); e.holes = [1, 2, 3, 4, 5, 6, 10, 11, 12]; db.holesEv = e.name })
    await app.tap('[data-ov="comps"]')
    const row = [...document.querySelectorAll('[data-o-comp]')].find(b => b.textContent.includes(app.db.holesEv))
    expect(row.textContent).toContain('Holes 1–6, 10–12')
    await app.tap(`[data-o-comp="${row.dataset.oComp}"]`)
    expect(document.querySelector('.odetail .ohead').textContent).toContain('Holes 1–6, 10–12')
  })
})
describe('open holes: a knockout round’s holes', () => {
  const draw = db => {
    Object.assign(db.signups[0], { closesOn: '2026-10-01', drawPublished: true, roundDeadlines: ['2026-11-15', '2026-12-06'] })
    db.signupEntries.push(...[0, 1, 3, 5].map((m, i) => ({ id: 100 + i, compId: 1, memberId: m, partnerId: null })))
    db.koMatches.push({ id: 1, compId: 1, round: 1, slot: 0, aEntry: 100, bEntry: 101, winnerEntry: null, result: null, status: 'open', reportedEntry: null },
      { id: 2, compId: 1, round: 1, slot: 1, aEntry: 102, bEntry: 103, winnerEntry: null, result: null, status: 'open', reportedEntry: null },
      { id: 3, compId: 1, round: 2, slot: 0, aEntry: null, bEntry: null, winnerEntry: null, result: null, status: 'open', reportedEntry: null })
  }
  it('the club office sets round 1 to the front 9; the match is decided over those holes', async () => {
    app = await boot(draw)
    await app.tap('Competition')
    await app.tap('Men’s Match Play')
    expect(app.main()).toContain('All 18 holes')
    await app.tap('[data-krh="1"]')
    await app.tap('[data-hpq="kr1:front"]')
    expect(app.db.signups[0].roundHoles).toEqual({ 1: [1, 2, 3, 4, 5, 6, 7, 8, 9] })
    expect(app.main()).toContain('Holes 1–9')
    await app.tap('Score this match')
    const card = app.db.rounds.at(-1)
    card.scores = card.scores.map(() => [3, 5]); card.done = card.done.map((_, i) => i < 9)
    await app.back()
    expect(app.text()).toContain('From the scorecard: Gary Cochrane won 5&4')
  })
  it('found in review: the match’s own scorecard plays the round’s holes', async () => {
    app = await boot(db => { draw(db); db.signups[0].roundHoles = { 1: [10, 11, 12, 13, 14, 15, 16, 17, 18] } })
    await app.tap('Competition')
    await app.tap('Men’s Match Play')
    await app.tap('Score this match')
    if (document.getElementById('gdone')) await app.tap('#gdone')
    expect([...document.querySelectorAll('.hgrid [data-j]')].map(b => +b.dataset.j + 1)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18])
    expect(app.screen()).toBe('Hole 10')
  })
  it('found in review: a halved 9-hole match says “After 9”, not “After 18”', async () => {
    app = await boot(db => { draw(db); db.signups[0].roundHoles = { 1: [1, 2, 3, 4, 5, 6, 7, 8, 9] }; db.members.find(m => m.id === 1).hcp = db.members.find(m => m.id === 0).hcp })
    await app.tap('Competition')
    await app.tap('Men’s Match Play')
    await app.tap('Score this match')
    const card = app.db.rounds.at(-1)
    card.scores = card.scores.map(() => [4, 4]); card.done = card.done.map((_, i) => i < 9)
    await app.back()
    await app.tap('[data-kcard="1"]')
    expect(app.text()).toContain('After 9')
    expect(app.text()).not.toContain('After 18')
  })
  it('a member who isn’t the organiser doesn’t get the Change button', async () => {
    app = await boot(db => { draw(db); db.members[0].admin = false })
    await app.tap('Competition')
    await app.tap('Men’s Match Play')
    expect(document.querySelector('[data-krh]')).toBe(null)
  })
})
describe('open holes: the scorecard plays only the open holes', () => {
  const holesNow = () => [...document.querySelectorAll('.hgrid [data-j]')].map(b => +b.dataset.j + 1)
  it('an event on holes 1–6 and 10–12: 9 holes on the card, 6 goes on to 10, the round ends after 12', async () => {
    app = await boot(db => { fourBall(db); db.holesEv = true })
    await app.tap('Competition'); await app.tap('Events'); await app.tap('+ Create your own event'); await app.tap('#cr-ev')
    await app.type('#ev-name', 'Short Course Swindle')
    await app.type('#ev-date', app.db.today)
    await app.tap('[data-style="individual"]')
    for (const n of [7, 8, 9, 13, 14, 15, 16, 17, 18]) await app.tap(`[data-hp="ev:${n}"]`)
    await app.tap('#ev-next')
    for (const id of [10, 12, 9]) await app.tap(`[data-pick="${id}"]`)
    await app.tap('#ev-next'); await app.tap('#ev-next') // Review → Save event
    await app.homeFromHere()
    await app.tap('Scoring')
    await app.tap('09:30')
    if (app.screen() === 'Scoring round?') {
      const tick = [...document.querySelectorAll('[data-k]')].find(b => b.textContent.includes('Short Course Swindle'))
      if (tick && tick.getAttribute('aria-pressed') !== 'true') await app.tap(`[data-k="${tick.dataset.k}"]`)
      if (document.querySelector('[data-mk]')) await app.tap('[data-mk="0"]')
      await app.tap('#start')
    }
    if (document.getElementById('gdone')) await app.tap('#gdone')
    expect(holesNow()).toEqual([1, 2, 3, 4, 5, 6, 10, 11, 12])
    expect(app.main()).toContain('Holes 1–6, 10–12 today')
    for (let n = 0; n < 6; n++) await app.tap('#save')
    expect(app.screen()).toBe('Hole 10')
    await app.homeFromHere()
    expect(app.text()).toContain('Hole 10 ·') // found in review: Home's tile names the next open hole
    await app.tap('Scoring')
    for (let n = 0; n < 3; n++) await app.tap('#save')
    expect(document.getElementById('submit')).not.toBe(null) // round complete after the 9th open hole
  })
  it('a general round still has all 18', async () => {
    app = await boot(fourBall)
    await app.tap('Scoring')
    await app.tap('09:30')
    if (app.screen() === 'Scoring round?') await app.tap('#start')
    if (document.getElementById('gdone')) await app.tap('#gdone')
    expect(holesNow()).toHaveLength(18)
  })
})
describe('club office: event templates and weekly repeats', () => {
  const office = db => { db.asOffice = true }
  const newClubEvent = async name => {
    await app.tap('[data-ov="comps"]'); await app.tap('#o-new'); await app.tap('[data-o-kind="event"]')
    await app.type('#ev-name', name)
    await app.tap('[data-style="individual"]')
    await app.tap('[data-who="all"]') // anyone playing that day: straight to the review
  }
  it('Save as a template: kept under Ready to run, and no event is made', async () => {
    app = await boot(office)
    await newClubEvent('Turkey Trot')
    await app.tap('[data-hpq="ev:front"]')
    await app.tap('#ev-next') // Review
    await app.tap('#ev-tpl')
    expect(app.db.eventTemplates).toHaveLength(1)
    expect(app.db.eventTemplates[0]).toMatchObject({ name: 'Turkey Trot', setup: { style: 'individual', holes: [1, 2, 3, 4, 5, 6, 7, 8, 9], selfEntry: true } })
    expect(app.db.eventTemplates[0].setup).not.toHaveProperty('startDate')
    expect(app.db.events.some(e => e.name === 'Turkey Trot')).toBe(false)
    if (app.screen() !== 'Competitions') await app.tap('[data-ov="comps"]')
    const row = [...document.querySelectorAll('[data-o-comp]')].find(b => b.textContent.includes('Turkey Trot'))
    expect(row.textContent).toContain('Ready to run')
  })
  const turkey = db => { office(db); db.eventTemplates.push({ id: 77, name: 'Turkey Trot', setup: { name: 'Turkey Trot', style: 'individual', fmt: 'stab', days: 1, club: true, everyone: true, selfEntry: true, holes: [1, 2, 3, 4, 5, 6, 7, 8, 9] } }) }
  it('Run on a day: an event on that date with the template’s settings; the template stays', async () => {
    app = await boot(turkey)
    await app.tap('[data-ov="comps"]')
    await app.tap('[data-o-comp="t:77"]')
    await app.type('#o-tdate', '2026-12-20')
    await app.tap('#o-trun')
    expect(app.main()).toContain('Turkey Trot')
    expect(app.main()).toContain('Holes 1–9')
    await app.tap('#ev-next') // Save event
    expect(app.db.events.find(e => e.name === 'Turkey Trot')).toMatchObject({ startDate: '2026-12-20', style: 'individual', holes: [1, 2, 3, 4, 5, 6, 7, 8, 9], selfEntry: true })
    expect(app.db.eventTemplates).toHaveLength(1)
  })
  it('Change a template: its settings without a date; saving changes the template, not an event', async () => {
    app = await boot(turkey)
    await app.tap('[data-ov="comps"]')
    await app.tap('[data-o-comp="t:77"]')
    await app.tap('#o-tedit')
    expect(document.getElementById('ev-date').closest('[hidden]')).not.toBe(null)
    await app.type('#ev-name', 'Turkey Trot Plus')
    await app.tap('[data-hpq="ev:all"]')
    await app.tap('#ev-next') // Review
    expect($ev('#ev-next').textContent).toBe('Save template')
    await app.tap('#ev-next')
    expect(app.db.eventTemplates).toEqual([expect.objectContaining({ id: 77, name: 'Turkey Trot Plus', setup: expect.objectContaining({ holes: null }) })])
    expect(app.db.events.some(e => e.name.startsWith('Turkey Trot'))).toBe(false)
  })
  it('Delete a template: tap twice', async () => {
    app = await boot(turkey)
    await app.tap('[data-ov="comps"]')
    await app.tap('[data-o-comp="t:77"]')
    await app.tap('#o-tdel'); await app.tap('#o-tdel')
    expect(app.db.eventTemplates).toHaveLength(0)
  })
  it('Repeat weekly until a date: one event a week, each its own', async () => {
    app = await boot(office)
    await newClubEvent('Sunday Stableford')
    await app.type('#ev-date', '2026-12-06')
    await app.tap('#ev-next') // Review
    await app.type('#ev-rep', '2027-01-10')
    expect(app.main()).toContain('Makes 6 events')
    await app.tap('#ev-next') // Save
    const made = app.db.events.filter(e => e.name === 'Sunday Stableford')
    expect(made.map(e => e.startDate)).toEqual(['2026-12-06', '2026-12-13', '2026-12-20', '2026-12-27', '2027-01-03', '2027-01-10'])
    expect(new Set(made.map(e => e.id)).size).toBe(6)
  })
  it('found in review: a weekly repeat is at most 52 events', async () => {
    app = await boot(office)
    await newClubEvent('Endless Stableford')
    await app.type('#ev-date', '2026-12-06')
    await app.tap('#ev-next')
    await app.type('#ev-rep', '2028-12-31')
    expect(app.main()).toContain('at most 52')
    await app.tap('#ev-next')
    expect(app.db.events.filter(e => e.name === 'Endless Stableford')).toHaveLength(0)
    expect(app.text()).toContain('at most 52')
    await app.type('#ev-rep', ''); await app.tap('#ev-next')
  })
  it('a league has no weekly repeat; a member’s own event has neither option', async () => {
    app = await boot(office)
    await app.tap('[data-ov="comps"]'); await app.tap('#o-new'); await app.tap('[data-o-kind="league"]')
    await app.type('#ev-name', 'Winter League')
    for (let i = 0; i < 3 && !document.getElementById('ev-tpl'); i++) { if (document.querySelector('#ev-next')?.textContent.startsWith('Save')) break; await app.tap('#ev-next') }
    expect(document.getElementById('ev-rep')).toBe(null)
    app.done(); app = await boot()
    await app.tap('Competition'); await app.tap('Events'); await app.tap('+ Create your own event'); await app.tap('#cr-ev')
    await app.type('#ev-name', 'Pals Cup'); await app.tap('[data-style="individual"]')
    await app.tap('#ev-next'); await app.tap('[data-pick="10"]'); await app.tap('[data-pick="12"]'); await app.tap('#ev-next')
    expect(document.getElementById('ev-tpl')).toBe(null)
    expect(document.getElementById('ev-rep')).toBe(null)
    await app.tap('#ev-next') // save it, so the journey ends back on Competitions
  })
})
describe('found in review: the event editor’s holes', () => {
  const start = async name => {
    await app.tap('Competition'); await app.tap('Events'); await app.tap('+ Create your own event'); await app.tap('#cr-ev')
    await app.type('#ev-name', name)
  }
  it('a league week with no holes open stops counting once the league is shorter than it', async () => {
    app = await boot(db => { db.asOffice = true })
    await app.tap('[data-ov="comps"]'); await app.tap('#o-new'); await app.tap('[data-o-kind="league"]')
    await app.type('#ev-name', 'Shrinking League')
    await app.tap('[data-evhd="6"]')
    await app.tap('[data-hpq="d6:front"]')
    for (let n = 1; n <= 9; n++) await app.tap(`[data-hp="d6:${n}"]`)
    expect($ev('#ev-next').disabled).toBe(true)
    await app.tap('[data-lg="weeks"][data-d="-1"]') // 5 weeks: week 6 has gone
    expect($ev('#ev-next').disabled).toBe(false)
  })
  it('switching a one-off to a season drops the event’s holes (a season’s days pick their own)', async () => {
    app = await boot()
    await start('Season Switch'); await app.tap('[data-style="ryder"]')
    await app.tap('[data-hpq="ev:front"]')
    await app.tap('[data-when="season"]')
    await app.type('#ev-end', '2027-03-31')
    await app.tap('#ev-next')
    for (const id of [10, 12, 9]) await app.tap(`[data-pick="${id}"]`)
    await app.tap('#ev-next'); await app.tap('#ev-bal'); await app.tap('#ev-next'); await app.tap('#ev-next'); await app.tap('#ev-next')
    expect(app.db.events.find(e => e.name === 'Season Switch')).toMatchObject({ season: true, holes: null })
  })
})
describe('club office: leagues and events open for sign-up', () => {
  it('the Winter League advertised from a date, entries closing, 4 places', async () => {
    app = await boot(db => { db.asOffice = true })
    await app.tap('[data-ov="comps"]'); await app.tap('#o-new'); await app.tap('[data-o-kind="league"]')
    await app.type('#ev-name', 'Frosty League')
    await app.type('#ev-date', '2026-12-07')
    await app.tap('#ev-signup')
    expect(+$ev('#ev-max').value).toBe(120) // 10 teams × 12: the league's team places to start with
    await app.type('#ev-adv', '2026-11-01')
    await app.type('#ev-close', '2026-11-30')
    await app.type('#ev-max', '4')
    expect(app.main()).toContain('Members see it from Sun 1 Nov · entries close Mon 30 Nov · 4 places')
    for (let i = 0; i < 4 && !$ev('#ev-next').textContent.startsWith('Save'); i++) await app.tap('#ev-next')
    expect(app.main()).toContain('Sign-up')
    await app.tap('#ev-next')
    expect(app.db.events.find(e => e.name === 'Frosty League')).toMatchObject({ signup: true, advertiseFrom: '2026-11-01', entriesClose: '2026-11-30', maxEntries: 4 })
  })
  it('entries can’t close on or after the first day', async () => {
    app = await boot(db => { db.asOffice = true })
    await app.tap('[data-ov="comps"]'); await app.tap('#o-new'); await app.tap('[data-o-kind="league"]')
    await app.type('#ev-name', 'Late League'); await app.type('#ev-date', '2026-12-07')
    await app.tap('#ev-signup'); await app.type('#ev-close', '2026-12-07')
    await app.tap('#ev-next')
    expect(app.text()).toContain('Entries have to close before the first day.')
  })
  const signupLeague = db => {
    db.asOffice = true
    db.events.push({ id: 880, name: 'Frosty League', style: 'league', fmt: 'beststab', club: true, everyone: false, startDate: '2026-12-07', days: 1, weeks: 10, bestOf: 4,
      teams: [], team: {}, players: [10], matches: {}, captainPool: [], signup: true, advertiseFrom: '2026-10-01', entriesClose: '2026-11-30', maxEntries: 4, createdBy: { id: 0, name: 'Gary Cochrane' } })
  }
  it('the office sees who’s entered, “1 of 4 places”, and can take someone off', async () => {
    app = await boot(signupLeague)
    await app.tap('[data-ov="comps"]')
    const row = document.querySelector('[data-o-comp="e:880"]')
    expect(row.textContent).toContain('Sign-up · 1 of 4')
    await app.tap('[data-o-comp="e:880"]')
    expect(document.querySelector('.odetail').textContent).toContain('1 of 4 places')
    expect(document.querySelector('[data-o-rment]')).toBe(null) // the names wait behind a tap (50+ would be a mess)
    await app.tap('[data-o-ents="880"]')
    expect(document.querySelector('[data-o-ents="880"]').textContent).toContain('Hide')
    await app.tap('[data-o-rment="10"]'); await app.tap('[data-o-rment="10"]')
    expect(app.db.events.find(e => e.id === 880).players).toEqual([])
  })
})
describe('members: leagues and events open for sign-up', () => {
  const league = (o = {}) => db => {
    db.members[0].admin = false
    db.events.push({ id: 881, name: 'Frosty League', style: 'league', fmt: 'beststab', club: true, everyone: false, startDate: '2026-12-07', days: 1, weeks: 10, bestOf: 4,
      teams: [], team: {}, players: [10, 12], matches: {}, captainPool: [], signup: true, advertiseFrom: '2026-10-01', entriesClose: '2026-11-30', maxEntries: 4, createdBy: { id: 1, name: 'Club' }, ...o })
  }
  const card = () => [...document.querySelectorAll('.comp')].find(c => c.textContent.includes('Frosty League'))
  const events = async () => { await app.tap('Competition'); await app.tap('[data-tab="events"]') }
  it('“2 spaces remaining”; Enter puts me in, under Entered with Withdraw', async () => {
    app = await boot(league())
    await events()
    expect(card().textContent).toContain('2 spaces remaining')
    expect(card().textContent).toContain('entries close Mon 30 Nov')
    await app.tap('[data-esign="881"]')
    expect(app.db.events.find(e => e.id === 881).players).toContain(0)
    expect(app.toast()).toContain('You’re in Frosty League')
    await app.tap('[data-tab="entered"]')
    expect(card().textContent).toContain('Withdraw')
  })
  it('full: a Full pill and no Enter', async () => {
    app = await boot(league({ maxEntries: 2 }))
    await events()
    expect(card().textContent).toContain('Full')
    expect(card().textContent).toContain('all 2 places taken')
    expect(document.querySelector('[data-esign="881"]')).toBe(null)
  })
  it('the last place goes while I’m looking: told in a notice I can see, and it shows Full', async () => {
    app = await boot(league({ maxEntries: 3 }))
    await events()
    app.db.events.find(e => e.id === 881).players.push(9) // someone else takes it
    await app.tap('[data-esign="881"]')
    expect(app.toast()).toContain('Sorry, it’s full')
    expect(card().textContent).toContain('Full')
  })
  it('withdrawing opens the place again', async () => {
    app = await boot(league({ players: [10, 12, 0], maxEntries: 3 }))
    await app.tap('Competition')
    await app.tap('[data-ewd="881"]'); await app.tap('[data-ewd="881"]')
    expect(app.db.events.find(e => e.id === 881).players).toEqual([10, 12])
  })
  it('not listed before it’s advertised, nor once sign-up is off; entered and full shows under Entered, not Full', async () => {
    app = await boot(db => { league({ advertiseFrom: '2026-11-20' })(db); league({ id: 882, name: 'Quiet League', signup: false })(db); league({ id: 883, name: 'Packed League', players: [10, 0], maxEntries: 2 })(db) })
    await events()
    expect(app.main()).not.toContain('Frosty League')
    expect(app.main()).not.toContain('Quiet League')
    expect(app.main()).not.toContain('Packed League')
    await app.tap('[data-tab="entered"]')
    expect([...document.querySelectorAll('.comp')].find(c => c.textContent.includes('Packed League')).textContent).toContain('Withdraw')
  })
})
describe('found in review: sign-ups on club events, templates and repeats', () => {
  const office = db => { db.asOffice = true }
  const newEvent = async name => {
    await app.tap('[data-ov="comps"]'); await app.tap('#o-new'); await app.tap('[data-o-kind="event"]')
    await app.type('#ev-name', name); await app.tap('[data-style="individual"]'); await app.tap('[data-who="pick"]')
  }
  it('a club Stableford open for sign-up saves with nobody entered yet', async () => {
    app = await boot(office)
    await newEvent('Christmas Medal'); await app.type('#ev-date', '2026-12-19')
    await app.tap('#ev-signup'); await app.type('#ev-max', '40')
    for (let i = 0; i < 3 && !$ev('#ev-next').textContent.startsWith('Save'); i++) await app.tap('#ev-next')
    await app.tap('#ev-next')
    expect(app.db.events.find(e => e.name === 'Christmas Medal')).toMatchObject({ signup: true, maxEntries: 40, players: [] })
  })
  it('weekly repeats move each week’s sign-up dates with it', async () => {
    app = await boot(office)
    await newEvent('Sunday Medal'); await app.type('#ev-date', '2026-12-06')
    await app.tap('#ev-signup'); await app.type('#ev-adv', '2026-11-29'); await app.type('#ev-close', '2026-12-04')
    for (let i = 0; i < 3 && !document.getElementById('ev-rep'); i++) await app.tap('#ev-next')
    await app.type('#ev-rep', '2026-12-13')
    await app.tap('#ev-next')
    expect(app.db.events.filter(e => e.name === 'Sunday Medal').map(e => [e.startDate, e.advertiseFrom, e.entriesClose]))
      .toEqual([['2026-12-06', '2026-11-29', '2026-12-04'], ['2026-12-13', '2026-12-06', '2026-12-11']])
  })
  it('a template keeps sign-up and places, not the dates', async () => {
    app = await boot(office)
    await newEvent('Turkey Medal'); await app.type('#ev-date', '2026-12-06')
    await app.tap('#ev-signup'); await app.type('#ev-close', '2026-12-04'); await app.type('#ev-max', '24')
    for (let i = 0; i < 3 && !document.getElementById('ev-tpl'); i++) await app.tap('#ev-next')
    await app.tap('#ev-tpl')
    expect(app.db.eventTemplates[0].setup).toMatchObject({ signup: true, maxEntries: 24 })
    expect(app.db.eventTemplates[0].setup).not.toHaveProperty('entriesClose')
  })
  it('switching to “Anyone playing that day” turns sign-up off', async () => {
    app = await boot(office)
    await newEvent('Day Medal'); await app.type('#ev-date', '2026-12-06')
    await app.tap('#ev-signup'); await app.tap('[data-who="all"]')
    await app.tap('#ev-next'); await app.tap('#ev-next')
    expect(app.db.events.find(e => e.name === 'Day Medal').signup).toBe(false)
  })
})
describe('found in review: sign-up places and the office’s Remove', () => {
  it('a team league’s places follow the teams until the office types its own number', async () => {
    app = await boot(db => { db.asOffice = true })
    await app.tap('[data-ov="comps"]'); await app.tap('#o-new'); await app.tap('[data-o-kind="league"]')
    await app.type('#ev-name', 'Growing League')
    await app.tap('#ev-signup')
    expect(+$ev('#ev-max').value).toBe(120)
    await app.tap('[data-lg="nteams"][data-d="-1"]') // 9 teams
    expect(+$ev('#ev-max').value).toBe(108)
    await app.type('#ev-max', '50')
    await app.tap('[data-lg="nteams"][data-d="-1"]')
    expect(+$ev('#ev-max').value).toBe(50)
  })
  it('Remove goes back to Remove if the second tap doesn’t come', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      app = await boot(db => {
        db.asOffice = true
        db.events.push({ id: 884, name: 'Remove League', style: 'league', fmt: 'beststab', club: true, everyone: false, startDate: '2026-12-07', days: 1, weeks: 10, bestOf: 4,
          teams: [], team: {}, players: [10], matches: {}, captainPool: [], signup: true, advertiseFrom: null, entriesClose: null, maxEntries: 4, createdBy: { id: 0, name: 'Gary Cochrane' } })
      })
      await app.tap('[data-ov="comps"]'); await app.tap('[data-o-comp="e:884"]'); await app.tap('[data-o-ents="884"]')
      await app.tap('[data-o-rment="10"]')
      expect($ev('[data-o-rment="10"]').textContent).toBe('Tap again')
      vi.advanceTimersByTime(5000)
      expect($ev('[data-o-rment="10"]').textContent).toBe('Remove')
      expect($ev('[data-o-rment="10"]').dataset.armed).not.toBe('1')
    } finally { vi.useRealTimers() }
  })
})
describe('found in review: the pretend server saves several events as the real one does', () => {
  it('saveEvents tidies each event like saveEvent, and refuses a day the event doesn’t have', async () => {
    app = await boot()
    const api = globalThis.__world.wrapped
    const base = { name: 'Twin', style: 'individual', fmt: 'stab', days: 1, startDate: '2026-12-06', players: [], team: {}, matches: {}, club: false }
    await api.saveEvents([{ ...base, points: { four: 2 }, dayRules: {}, signup: true, maxEntries: 9 }])
    expect(app.db.events.find(e => e.name === 'Twin')).toMatchObject({ points: null, dayRules: null, signup: false, maxEntries: null })
    await expect(api.saveEvents([{ ...base, name: 'Twin 2', dayRules: { 3: { holes: [1] } } }])).rejects.toThrow('aren’t for a match day')
    await expect(api.saveEvent({ ...base, name: 'Twin 3', dayRules: { 3: { holes: [1] } } })).rejects.toThrow('aren’t for a match day')
  })
  it('knockout holes: a knockout that’s gone, or a round beyond the draw, is refused', async () => {
    app = await boot()
    const api = globalThis.__world.wrapped
    await expect(api.setKoRoundHoles(-1, 1, [1])).rejects.toThrow('no longer exists')
    await expect(api.setKoRoundHoles(1, 11, [1])).rejects.toThrow('isn’t a round')
  })
})
