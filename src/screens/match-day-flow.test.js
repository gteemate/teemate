// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { S } from '../state.js'
import { openFlow, currentFlow } from './match-day-flow.js'

describe('found in review: a match day setup belongs to its event', () => {
  const ev = id => ({ id, startDate: '2026-10-01', days: 100, season: true, players: [1, 2], team: { 1: 'A', 2: 'B' }, matches: {} })
  it('left open on one event, it isn’t shown on another', () => {
    openFlow(ev(900))
    expect(currentFlow(ev(900))).toBe(S.mdFlow)
    expect(currentFlow(ev(901))).toBeNull()
    expect(S.mdFlow).toBeNull()
  })
})

import { flowBack } from './match-day-flow.js'
describe('Back inside the match day steps', () => {
  const ev = { id: 900, startDate: '2026-10-01', days: 100, season: true, players: [1, 2], team: { 1: 'A', 2: 'B' }, matches: { 5: [{ a: [1], b: [2] }] } }
  it('a new day: from Who’s playing back to the date, not out', () => {
    openFlow(ev); S.mdFlow.d = 12; S.mdFlow.step = 'players'
    flowBack(S.mdFlow)
    expect(S.mdFlow?.step).toBe('date')
    flowBack(S.mdFlow)
    expect(S.mdFlow).toBeNull()
  })
  it('back from Matches keeps the matches built', () => {
    openFlow(ev, 5); S.mdFlow.step = 'matches'
    flowBack(S.mdFlow)
    expect(S.mdFlow).toMatchObject({ step: 'players', matches: [{ a: [1], b: [2] }] })
    flowBack(S.mdFlow)
    expect(S.mdFlow).toBeNull()
  })
})
