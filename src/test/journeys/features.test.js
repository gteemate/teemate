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
  it('Ryder Cup: teams, the draw, play the match on one card, the board shows the match result', async () => {
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
