import { describe, it, expect } from 'vitest'
import { toColumns, colChecks, guessPlayers, matchProblem, toScores } from './reading.js'
import { PAPER_READING } from '../test/journeys/fake-api.js'

const ALL = [...Array(18).keys()]
const lineup = [{ m: 0 }, { m: 1 }, { m: 3 }, { g: 7 }]

describe('the reading, column by column', () => {
  it('gives every Score column with its card and label', () => {
    expect(toColumns(PAPER_READING).map(c => `${c.card}${c.label}`)).toEqual(['1A', '1B', '2A', '2B'])
  })
  it('marks a column with nothing written as blank', () => {
    const r = structuredClone(PAPER_READING)
    r.cards[1].columns[1] = { label: 'B', holes: ALL.map(() => ({ score: null, sure: true })), out: null, in: null, total: null }
    const cols = toColumns(r)
    expect(cols[3].blank).toBe(true)
    expect(cols[0].blank).toBe(false)
  })
})

describe('checks on one column', () => {
  const pat = toColumns(PAPER_READING)[1]
  it('the holes it was unsure of, and the totals against what is written', () => {
    const c = colChecks(pat, ALL)
    expect(c.unsure).toEqual([7, 17])
    expect(c.out).toEqual({ holes: 44, written: 44, ok: true })
    expect(c.in).toEqual({ holes: 43, written: 44, ok: false })
  })
  it('no totals check when nothing is written', () => {
    const col = { ...pat, out: null, in: null }
    expect(colChecks(col, ALL).out).toBeNull()
    expect(colChecks(col, ALL).in).toBeNull()
  })
  it('only the open holes count (an event on holes 1–6 and 10–12)', () => {
    const open = [0, 1, 2, 3, 4, 5, 9, 10, 11]
    const c = colChecks({ ...pat, out: 28, in: 12 }, open)
    expect(c.out).toEqual({ holes: 4 + 4 + 4 + 6 + 5 + 5, written: 28, ok: true })
    expect(c.in).toEqual({ holes: 4 + 5 + 3, written: 12, ok: true })
    expect(c.unsure).toEqual([]) // holes 8 and 18 are closed
    expect(toScores(pat, open)).toEqual([4, 4, 4, 6, 5, 5, null, null, null, 4, 5, 3, null, null, null, null, null, null])
  })
  it('a half with no open holes has no check', () => {
    expect(colChecks(pat, [9, 10, 11]).out).toBeNull()
  })
})

describe('matching columns to players', () => {
  it('guesses the card order, skipping blank columns', () => {
    const cols = toColumns(PAPER_READING)
    expect(guessPlayers(cols, lineup)).toEqual(['m0', 'm1', 'm3', 'g7'])
    cols[1].blank = true
    expect(guessPlayers(cols, lineup)).toEqual(['m0', null, 'm1', 'm3'])
  })
  it('a player can only have one column, and I must have mine', () => {
    const names = { m0: 'You', m1: 'Pat Reid', m3: 'Chris Lowe' }
    expect(matchProblem(['m0', 'm1', 'm3'], 'm0', names)).toBeNull()
    expect(matchProblem(['m0', 'm1', 'm1'], 'm0', names)).toBe('Two columns are set to Pat Reid. Each player can only have one column.')
    expect(matchProblem(['m1', 'm3', null], 'm0', names)).toBe('Pick your own column.')
  })
})
