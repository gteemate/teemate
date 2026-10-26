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
