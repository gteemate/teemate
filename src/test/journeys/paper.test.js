// @vitest-environment happy-dom
// Journeys for paper scorecards: the club office switches it on; after the round one member photographs the
// group's cards, the names are cut off, the pretend reader reads them, and the member matches the columns, checks
// every player and picks who confirms their own score. The camera and the crop are stood in for (io below).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { boot } from './driver.js'

vi.mock('../../api.js', async () => (await import('./fake-api.js')).mockModule())

let app
afterEach(async ctx => {
  if (!app) return
  try { if (ctx.task.result?.state !== 'fail' && !app.db?.asOffice && app.screen() !== 'Home') await app.homeFromHere() } finally { app.done(); app = null }
})

const at = (db, time) => db.slotsOn(db.today).find(s => s.time === time)
const fourBall = db => db.book(0, at(db, 570).id, [10, 12, 9]) // Gary's 09:30 with Tom, Orla and Eoin (in no events)

async function fakeCamera() {
  const flow = await import('../../paper/paper-flow.js')
  flow.io.choose = async () => new File(['card'], 'card.jpg', { type: 'image/jpeg' })
  flow.io.preview = () => 'data:,'
  flow.io.crop = async () => new Blob(['grid'], { type: 'image/jpeg' })
}

async function openCard() {
  await app.tap('Scoring')
  await app.tap('09:30')
  if (app.screen() === 'Scoring round?') await app.tap('#start')
  if (document.getElementById('gdone')) await app.tap('#gdone')
}

/** From the card to the matching screen: two photos, both boxes confirmed. */
async function photographBoth() {
  await app.tap('Photograph your card instead')
  expect(app.screen()).toBe('Photograph your card')
  await app.tap('Take photo of card 1')
  expect(app.screen()).toBe('Are all the scores in the box?')
  expect(app.main()).toContain('Names stay on your phone')
  await app.tap('Yes, all the scores are in the box')
  await app.tap('Take photo of card 2')
  await app.tap('Yes, all the scores are in the box')
}

const card = () => app.db.rounds.find(r => r.date === app.db.today && r.lineup.some(x => x.m === 0))
const col = k => card().lineup.findIndex(x => x.m === k)

describe('paper scorecards: the club office switch', () => {
  it('the office switches it on; a member then sees the small photo link on a card with no scores', async () => {
    app = await boot(db => { db.asOffice = true })
    await app.tap('[data-ov="club"]')
    expect(app.main()).toContain('Paper scorecards')
    await app.tap('[data-o-paper="on"]')
    expect(app.db.theme.paperCards).toBe(true)
  })
  it('switched off, members don’t see it', async () => {
    app = await boot(fourBall)
    await openCard()
    expect(app.main()).not.toContain('Photograph your card instead')
  })
})

describe('paper scorecards: reading the group’s cards', () => {
  it('two cards → names cut off → read → matched → each player checked (fixing hole 18) → Orla to confirm → saved', async () => {
    app = await boot(db => { fourBall(db); db.theme.paperCards = true })
    await fakeCamera()
    await openCard()
    expect(app.main()).toContain('Scores entered as you play show on the live leaderboard')
    await photographBoth()
    expect(app.db.calls.filter(c => c[0] === 'readScorecard')).toEqual([['readScorecard', 2]])
    expect(app.screen()).toBe('4 players found')
    expect(app.main()).toContain('Card 1 · column B')
    await app.tap('#pf-next')
    // Tom has card 1's B column: holes 8 and 18 were hard to read, and In doesn't add up
    expect(app.screen()).toBe('Tom Byrne')
    expect(app.main()).toContain('the card says 44')
    await app.tap('[data-ph="17"]')
    await app.tap('[data-pn="10"]')
    expect(app.main()).toContain('In adds up to 44')
    await app.tap('Tom’s scores are right')
    await app.tap('Orla’s scores are right')
    await app.tap('Eoin’s scores are right')
    expect(app.screen()).toBe('Your scores')
    await app.tap('My scores are right')
    expect(app.screen()).toBe('Who’ll confirm your score?')
    await app.tap('[data-conf="12"]')
    await app.tap('#pf-save')
    expect(app.toast()).toBe('Card saved. Orla will confirm your score.')
    const r = card()
    expect(r.paper).toMatchObject({ by: 0, confirmer: 12, state: 'waiting', photos: 2 })
    expect(r.done.every(Boolean)).toBe(true)
    expect(r.scores[17][col(10)]).toBe(10)
    expect(r.scores.map(h => h[col(0)]).reduce((a, b) => a + b)).toBe(85)
    expect(app.db.photos).toEqual([`${r.id}/1.jpg`, `${r.id}/2.jpg`])
  })

  it('two columns set to the same player: Next is off until it’s fixed', async () => {
    app = await boot(db => { fourBall(db); db.theme.paperCards = true })
    await fakeCamera()
    await openCard()
    await photographBoth()
    await app.type('[data-pcol="1"]', 'm12')
    expect(app.main()).toContain('Two columns are set to Orla')
    expect(document.getElementById('pf-next').disabled).toBe(true)
    await app.type('[data-pcol="2"]', 'm10')
    expect(document.getElementById('pf-next').disabled).toBe(false)
  })

  it('the daily limit: says so, and Enter scores by hand goes back to the card', async () => {
    app = await boot(db => { fourBall(db); db.theme.paperCards = true; db.paperReads[0] = 10 })
    await fakeCamera()
    await openCard()
    await photographBoth()
    expect(app.main()).toContain('You’ve read 10 cards today')
    await app.tap('Enter scores by hand')
    expect(document.getElementById('save')).not.toBeNull()
  })

  it('a card for another course: says so, with Retake', async () => {
    app = await boot(db => { fourBall(db); db.theme.paperCards = true; db.paperReading = { ...db.paperReading, parMatches: false } })
    await fakeCamera()
    await openCard()
    await photographBoth()
    expect(app.main()).toContain('This doesn’t look like a card for this course.')
    await app.tap('Retake')
    expect(app.screen()).toBe('Photograph your card')
  })

  it('the office switches it off after the reading: the card still saves', async () => {
    app = await boot(db => { fourBall(db); db.theme.paperCards = true })
    await fakeCamera()
    await openCard()
    await photographBoth()
    app.db.theme.paperCards = false
    await app.tap('#pf-next')
    for (const who of ['Tom’s scores are right', 'Orla’s scores are right', 'Eoin’s scores are right', 'My scores are right']) await app.tap(who)
    await app.tap('[data-conf="office"]')
    await app.tap('#pf-save')
    expect(app.toast()).toBe('Card saved. Hand it in at the office.')
    expect(card().paper).toMatchObject({ confirmer: null, state: 'waiting' })
  })

  it('an event on holes 1–6 and 10–12: only those holes are checked and saved', async () => {
    app = await boot(db => { fourBall(db); db.theme.paperCards = true })
    await fakeCamera()
    await app.tap('Competition'); await app.tap('Events'); await app.tap('+ Create your own event'); await app.tap('#cr-ev')
    await app.type('#ev-name', 'Short Course Swindle')
    await app.type('#ev-date', app.db.today)
    await app.tap('[data-style="individual"]')
    for (const n of [7, 8, 9, 13, 14, 15, 16, 17, 18]) await app.tap(`[data-hp="ev:${n}"]`)
    await app.tap('#ev-next')
    for (const id of [10, 12, 9]) await app.tap(`[data-pick="${id}"]`)
    await app.tap('#ev-next'); await app.tap('#ev-next')
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
    await photographBoth()
    await app.tap('#pf-next')
    expect([...document.querySelectorAll('[data-ph]')].map(b => +b.dataset.ph + 1)).toEqual([1, 2, 3, 4, 5, 6, 10, 11, 12])
    expect(app.main()).not.toContain('Hole 8 was hard to read') // closed
    for (const who of ['Tom’s scores are right', 'Orla’s scores are right', 'Eoin’s scores are right', 'My scores are right']) await app.tap(who)
    await app.tap('[data-conf="10"]')
    await app.tap('#pf-save')
    const r = card()
    expect(r.done.map((d, h) => (d ? h + 1 : 0)).filter(Boolean)).toEqual([1, 2, 3, 4, 5, 6, 10, 11, 12])
  })

  it('a two-ball: Only one card goes straight to reading', async () => {
    app = await boot(db => { db.book(0, at(db, 570).id, [10]); db.theme.paperCards = true })
    await fakeCamera()
    await openCard()
    await app.tap('Photograph your card instead')
    await app.tap('Take photo of card 1')
    await app.tap('Yes, all the scores are in the box')
    expect(app.screen()).toBe('2 players found')
  })
})

// A card read from paper today: Tom (10) uploaded it and Gary (0, me) was asked to confirm, or the other way round.
const paperCard = (db, { by = 10, confirmer = 0, state = 'waiting', note = null } = {}) => {
  const b = db.book(0, at(db, 570).id, [10])
  db.rounds.push({ id: 61, date: db.today, slotId: b.slotId, createdBy: by, lineup: [{ m: 0 }, { m: 10 }], game: 'stab', pairing: 0, submitted: {},
    scores: Array.from({ length: 18 }, (_, h) => [h < 9 ? 5 : 4, h < 9 ? 4 : 5]), done: Array.from({ length: 18 }, () => true),
    paper: { by, confirmer, state, note, photos: 1 } })
  db.photos.push('61/1.jpg')
}

describe('paper scorecards: confirming the uploader’s score', () => {
  it('the person asked confirms it from the drop-down', async () => {
    app = await boot(db => paperCard(db))
    await app.settle()
    const alerts = document.getElementById('alerts').textContent
    expect(alerts).toContain('Please confirm a score')
    expect(alerts).toContain('Tom Byrne · 81 (Out 36 · In 45)')
    await app.tap('[data-al="pconfirm"]')
    expect(app.db.rounds.find(r => r.id === 61).paper).toMatchObject({ state: 'confirmed', confirmer: 0 })
    expect(app.toast()).toBe('Score confirmed')
  })

  it('Not right: a short note goes back to the uploader', async () => {
    app = await boot(db => paperCard(db))
    await app.settle()
    await app.tap('[data-al="pback"]')
    expect(app.text()).toContain('What isn’t right?')
    await app.type('#pb-note', 'Hole 14 was a 6')
    await app.tap('#pb-send')
    expect(app.db.rounds.find(r => r.id === 61).paper).toMatchObject({ state: 'sent_back', note: 'Hole 14 was a 6' })
  })

  it('the club office confirms one left for the office, from Today', async () => {
    app = await boot(db => { paperCard(db, { confirmer: null }); db.asOffice = true })
    expect(app.main()).toContain('Score to confirm: Tom Byrne · 81')
    expect(app.text()).toContain('1 thing waiting for you')
    await app.tap('[data-o-pconf="61"]')
    expect(app.db.rounds.find(r => r.id === 61).paper).toMatchObject({ state: 'confirmed', confirmer: null })
  })

  it('my card says who it waits for; sent back, I fix my score and send it again', async () => {
    app = await boot(db => paperCard(db, { by: 0, confirmer: 10, state: 'sent_back', note: 'Hole 14 was a 6' }))
    expect(app.screen()).toMatch(/^Hole/) // mid-round, the app opens on the scorecard
    expect(app.main()).toContain('Read from paper')
    expect(app.main()).toContain('Tom says your score isn’t right: “Hole 14 was a 6”')
    await app.tap('Check my scores')
    expect(app.screen()).toBe('Your scores')
    await app.tap('[data-ph="13"]')
    await app.tap('[data-pn="6"]')
    await app.tap('My scores are right')
    const r = app.db.rounds.find(x => x.id === 61)
    expect(r.paper.state).toBe('waiting')
    expect(r.scores[13][0]).toBe(6)
    expect(app.toast()).toBe('Sent to Tom again')
    expect(app.main()).toContain('Awaiting confirmation')
  })
})
