import { describe, it, expect } from 'vitest'
import { roundPill } from './round-pill.js'

const N = 18, f = Array(N).fill(false), z = Array(N).fill(0), pars = Array(N).fill(4)
const card = (o = {}) => ({ done: f, gross: Array(N).fill(null), pars, shots: z, finished: false, ...o })
const first = (n, vals) => [...vals, ...Array(N - n).fill(null)]
const doneTo = n => f.map((_, i) => i < n)

describe('roundPill: Scoring tile on Home', () => {
  it('nothing saved yet: no pill', () => expect(roundPill(card())).toBeNull())
  it('a finished round: no pill', () => expect(roundPill(card({ done: doneTo(18), gross: Array(N).fill(4), finished: true }))).toBeNull())
  it('three holes saved, one over (gross game): Hole 4 · +1', () =>
    expect(roundPill(card({ done: doneTo(3), gross: first(3, [5, 4, 4]) }))).toBe('Hole 4 · +1'))
  it('net: a shot on the hole you bogeyed makes it level', () =>
    expect(roundPill(card({ done: doneTo(3), gross: first(3, [5, 4, 4]), shots: [1, ...Array(17).fill(0)] }))).toBe('Hole 4 · E'))
  it('under par shows a minus', () =>
    expect(roundPill(card({ done: doneTo(3), gross: first(3, [3, 3, 4]) }))).toBe('Hole 4 · -2'))
  it('holes saved out of order: next is the first unsaved; the score counts saved holes only', () => {
    const done = [true, false, true, ...Array(15).fill(false)]
    expect(roundPill(card({ done, gross: [5, 7, 4, ...Array(15).fill(null)] }))).toBe('Hole 2 · +1')
  })
  it('all 18 saved but not finished: stays on 18', () =>
    expect(roundPill(card({ done: doneTo(18), gross: Array(N).fill(4) }))).toBe('Hole 18 · E'))
})
