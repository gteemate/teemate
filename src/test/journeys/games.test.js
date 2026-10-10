// @vitest-environment happy-dom
// Journeys: a full 18-hole round of every game the scorecard plays, entered on screen like a group would (scores
// changed with − / +, each hole saved, Finish round). Each checks the card's result line against the scoring rules
// worked out separately from the saved card, so the screen and the rules can't drift apart.
import { describe, it, expect, vi, afterEach, afterAll } from 'vitest'
import { writeFileSync } from 'node:fs'
import { boot } from './driver.js'
import { COURSE, MEMBERS, GAME_SETTINGS } from '../../sample-data.js'
import { courseHandicap, playingHandicaps, gameState, upText, toPar } from '../../scoring.js'
import { buildLibrary, gameSpec, teeRating, PAIRINGS } from '../../games.js'

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
afterAll(() => { if (process.env.TAP_REPORT) writeFileSync(process.env.TAP_REPORT.replace(/\.json$/, '-games.json'), JSON.stringify(tapLog, null, 1)) })

const at = (db, time) => db.slotsOn(db.today).find(s => s.time === time)
const L = buildLibrary(GAME_SETTINGS)
// Gary with members not in today's events (so the card is just the game).
const GROUP = { 2: [10], 3: [10, 12], 4: [10, 12, 9] }
// Each hole's scores away from par, by player: varied so every game has winners and losers.
const pattern = (n, i) => [[-1, 0, 1, 0, 1, -1, 0, 0, 1][i % 9], [0, 1, -1, 1, 0, 0, 2, -1, 0][i % 9], [1, 0, 0, -1, 0, 1, 0, 1, -1][i % 9], [0, -1, 1, 0, 1, 0, -1, 0, 1][i % 9]].slice(0, n)

// The result line the card should show, worked out from the saved card with the scoring rules.
function expected(card, key) {
  const n = card.lineup.length
  const ps = card.lineup.map(x => MEMBERS.find(m => m.id === x.m))
  const G = gameSpec(L.lib[key])
  const ph = playingHandicaps(ps.map(p => courseHandicap(p.hcp, teeRating(COURSE))), G.allow, G.offLow)
  const played = card.done.filter(Boolean).length
  const gs = gameState(G, COURSE.holes, ph, card.scores, played, PAIRINGS[card.pairing ?? 0])
  const sur = name => name.split(' ').slice(-1)[0]
  if (G.kind === 'match1') { const m = gs.match, who = m.lead === 'A' ? 'You' : m.lead === 'B' ? sur(ps[1].name) : null; return who ? `${who} ${m.over ? `win${who === 'You' ? '' : 's'} ${m.text}` : m.text}` : m.text }
  if (G.kind === 'match') { const m = gs.match, o = PAIRINGS[card.pairing ?? 0], pair = s => (s === 'A' ? [o[0], o[1]] : [o[2], o[3]]).map(k => sur(ps[k].name)).join(' / '); return m.lead ? `${pair(m.lead)} ${m.over ? `win ${m.text}` : m.text}` : m.text }
  const v = gs.totals[0]
  if (G.kind === 'stab' || G.kind === 'six') return `You: ${v} pts thru ${gs.thru}`
  if (G.kind === 'skins') return `You: ${v} skin${v === 1 ? '' : 's'} · ${gs.carry} carrying`
  return `You: ${toPar(v)} net thru ${gs.thru}`
}

// + Add a match → A game for the group → pick it → Play this (a new card is scores only).
async function chooseGame(key) {
  await app.tap('#gname')
  await app.tap('[data-am="group"]')
  await app.tap(`[data-gk="${key}"]`)
  await app.tap('#am-go')
}

async function playRound(n, key) {
  app = await boot(db => db.book(0, at(db, 570).id, GROUP[n]))
  await app.tap('Scoring')
  await app.tap('09:30')
  if (app.screen() === 'Scoring round?') await app.tap('#start') // a general round: nothing ticked
  await chooseGame(key)
  if (document.getElementById('gdone')) await app.tap('#gdone') // pairs games open the pairs menu first
  for (let h = 0; h < 18 && !document.getElementById('submit'); h++) {
    pattern(n, h).forEach(d => d)
    for (const [k, d] of pattern(n, h).entries()) for (let x = 0; x < Math.abs(d); x++) await app.tap(`[data-k="${k}"][data-d="${Math.sign(d)}"]`)
    await app.tap('#save')
  }
  const card = app.db.rounds.at(-1)
  expect(card.game).toBe(key)
  expect(document.querySelector('.rstatus b').textContent).toBe(expected(card, key))
  await app.tap('#submit')
  expect(app.toast()).toContain('Round saved')
  expect(app.db.rounds.at(-1).submitted[key]).toBe(true)
}

describe('a full round of every game on the scorecard', () => {
  for (const n of [2, 3, 4]) {
    for (const x of L.sections[n].games.filter(g => g.play && g.on)) {
      it(`${n} players · ${x.name}: 18 holes on screen, the result matches the rules, Finish round`, async () => {
        await playRound(n, x.k)
      })
    }
  }
  it('a match that is won early ends there: Finish round appears before the 18th', async () => {
    app = await boot(db => db.book(0, at(db, 570).id, [10]))
    await app.tap('Scoring'); await app.tap('09:30')
    if (app.screen() === 'Scoring round?') await app.tap('#start')
    await chooseGame('sc2') // scratch: every birdie wins the hole
    let h = 0
    for (; h < 18 && !document.getElementById('submit'); h++) { await app.tap('[data-k="0"][data-d="-1"]'); await app.tap('#save') }
    expect(h).toBe(10) // 10 up with 8 to play
    expect(document.querySelector('.rstatus b').textContent).toBe('You win 10&8')
  })

  it('a new card is scores only: + Add a match, and everyone’s points in the standings', async () => {
    app = await boot(db => db.book(0, at(db, 570).id, GROUP[4]))
    await app.tap('Scoring'); await app.tap('09:30')
    if (app.screen() === 'Scoring round?') await app.tap('#start')
    expect(app.db.rounds.at(-1)?.game ?? 'none').toBe('none')
    expect(document.querySelector('#gname').textContent).toContain('+ Add a match')
    await app.tap('#save')
    expect(app.text()).toContain('Standings')
  })
  it('one against one on a four-ball card: just those two, shots off the lower of them; the result matches the rules', async () => {
    app = await boot(db => db.book(0, at(db, 570).id, GROUP[4]))
    await app.tap('Scoring'); await app.tap('09:30')
    if (app.screen() === 'Scoring round?') await app.tap('#start')
    await app.tap('#gname')
    await app.tap('[data-am="one"]')
    await app.tap('[data-op="c2"]') // the third player on the card
    await app.tap('[data-ok="kos"]')
    await app.tap('#am-go')
    const opp = app.db.rounds.at(-1).lineup[2]
    expect(app.db.rounds.at(-1).game).toBe(`kos:m0:m${opp.m}`)
    for (let h = 0; h < 18 && !document.getElementById('submit'); h++) {
      for (const [k, d] of pattern(4, h).entries()) for (let x = 0; x < Math.abs(d); x++) await app.tap(`[data-k="${k}"][data-d="${Math.sign(d)}"]`)
      await app.tap('#save')
    }
    const card = app.db.rounds.at(-1), duo = [0, 2], ps = duo.map(k => MEMBERS.find(m => m.id === card.lineup[k].m))
    const G = gameSpec(L.lib.kos), ph = playingHandicaps(ps.map(p => courseHandicap(p.hcp, teeRating(COURSE))), G.allow, G.offLow)
    const m = gameState(G, COURSE.holes, ph, card.scores.map(r => duo.map(k => r[k])), card.done.filter(Boolean).length).match
    const who = m.lead === 'A' ? 'You' : m.lead === 'B' ? ps[1].name.split(' ').slice(-1)[0] : null
    expect(document.querySelector('.rstatus b').textContent).toBe(who ? `${who} ${m.over ? `win${who === 'You' ? '' : 's'} ${m.text}` : m.text}` : m.text)
    expect(document.querySelector('#gname').textContent).toContain(`You v ${ps[1].name.split(' ').slice(-1)[0]}`)
    await app.tap('#submit')
  })
  it('the match can be taken off again (scores only), and a challenge is one of the choices', async () => {
    app = await boot(db => db.book(0, at(db, 570).id, GROUP[4]))
    await app.tap('Scoring'); await app.tap('09:30')
    if (app.screen() === 'Scoring round?') await app.tap('#start')
    await chooseGame('skins')
    expect(app.db.rounds.at(-1).game).toBe('skins')
    await app.tap('#gname')
    await app.tap('[data-am="none"]')
    expect(app.db.rounds.at(-1).game).toBe('none')
    await app.tap('#gname')
    await app.tap('[data-am="challenge"]')
    expect(app.screen()).toBe('Play an event')
  })
})
