// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
vi.mock('../api.js', () => ({}))
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

import { flowNext } from './match-day-flow.js'
describe('found in review: a match day’s holes', () => {
  const oneOff = () => ({ id: 902, startDate: '2026-11-01', days: 1, season: false, holes: [1, 2, 3, 4, 5, 6, 7, 8, 9], players: [1, 2], team: { 1: 'A', 2: 'B' }, matches: { 1: [{ a: [1], b: [2] }] } })
  const toConfirm = (e, holes) => { openFlow(e, 1); S.mdFlow.step = 'confirm'; if (holes !== undefined) S.mdFlow.holes = holes; flowNext(e, S.mdFlow) }
  it('All 18 on a day of an event on the front 9 is kept as all 18, not the event’s holes', () => {
    const e = oneOff(); toConfirm(e, null)
    expect(e.dayRules[1].holes).toEqual(Array.from({ length: 18 }, (_, i) => i + 1))
  })
  it('a day left on the event’s holes has none of its own (it follows the event)', () => {
    const e = oneOff(); toConfirm(e)
    expect(e.dayRules[1]).not.toHaveProperty('holes')
  })
  it('a season day on all 18 keeps nothing of its own', () => {
    const e = { ...oneOff(), season: true, holes: null, days: 100 }; toConfirm(e, null)
    expect(e.dayRules[1]).not.toHaveProperty('holes')
  })
})

import { templateOf } from './event-editor.js'
describe('found in review: what a template keeps', () => {
  it('not a league’s old knockout final date, nor a season’s days', () => {
    const t = templateOf({ id: 1, name: 'L', style: 'league', weeks: 6, koTop: 8, koFinish: '2026-01-31', startDate: '2025-11-01', players: [1], team: {}, matches: {} })
    expect(t).not.toHaveProperty('koFinish')
    expect(t.koTop).toBe(8)
    const s = templateOf({ id: 2, name: 'S', style: 'ryder', season: true, days: 120, dayRules: { 3: { points: { four: 2 } } }, holes: null, startDate: '2025-11-01', players: [], team: {}, matches: { 3: [] } })
    expect(s).not.toHaveProperty('dayRules')
    expect(s.days).toBe(1)
  })
})

import { flowHtml } from './match-day-flow.js'
describe('found on a phone: Who’s playing on a match day', () => {
  it('each player row has the initials badge the row layout expects, so the name gets the full width', () => {
    const ev = { id: 900, startDate: '2026-10-01', days: 100, season: true, players: [1, 2], team: { 1: 'A', 2: 'B' }, matches: {},
      A: { name: 'Blues', col: '#6f8fd8' }, B: { name: 'Reds', col: '#c27a8f' } }
    openFlow(ev); S.mdFlow.d = 12; S.mdFlow.step = 'players'; S.mdFlow.playing = [1]
    document.body.innerHTML = flowHtml(ev, S.mdFlow, id => ({ 1: 'Aoife Brennan', 2: 'Ciarán O’Neill' })[id])
    const rows = [...document.querySelectorAll('[data-mdp]')]
    expect(rows.map(r => r.firstElementChild.className)).toEqual(['av', 'av'])
    expect(rows[0].querySelector('.av').textContent).toBe('AB')
  })
})
