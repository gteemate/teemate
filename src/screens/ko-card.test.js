// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
vi.mock('../api.js', () => ({}))
import { koStates } from './ko-card.js'
import { COURSE, GAME_SETTINGS } from '../sample-data.js'

// A knockout final between members 1 and 2, linked to a scorecard with only hole 1 played (member 2 won it).
const entries = [{ id: 11, memberId: 1 }, { id: 12, memberId: 2 }]
const members = [{ id: 1, name: 'Live Tester', hcp: 10 }, { id: 2, name: 'Peter Reid', hcp: 10 }]
const matches = [{ id: 5, round: 3, aEntry: 11, bEntry: 12, roundId: 70, status: 'open' }]
const card = date => ({ id: 70, date, game: 'kos', lineup: [{ m: 1 }, { m: 2 }], pairing: 0,
  scores: COURSE.holes.map((h, i) => (i === 0 ? [h.par + 1, h.par] : [h.par, h.par])), done: COURSE.holes.map((_, i) => i === 0) })
const states = date => koStates({ matches, entries, members, course: COURSE, games: { ...GAME_SETTINGS, mine: {} }, cards: { 70: card(date) }, today: '2026-10-27' })

describe('found on a phone: a knockout match’s scorecard', () => {
  it('today’s card, still being played, shows where the match stands', () => {
    expect(states('2026-10-27')[5]).toBeTruthy()
  })
  it('a card from an earlier day that was never finished is left out (it’s no longer on the Scores tab)', () => {
    expect(states('2026-10-26')[5]).toBeUndefined()
  })
})
