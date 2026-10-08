import { describe, it, expect } from 'vitest'
import { parseHcp, fmtHcp } from './ui.js'

describe('handicap index input', () => {
  it('reads what people type', () => {
    expect(parseHcp('18.4')).toBe(18.4)
    expect(parseHcp(' 12,6 ')).toBe(12.6) // comma decimal
    expect(parseHcp('+2')).toBe(-2) // plus handicap
    expect(parseHcp('0')).toBe(0)
    expect(parseHcp('54')).toBe(54)
  })
  it('blank means not set yet', () => {
    expect(parseHcp('')).toBeNull()
    expect(parseHcp('   ')).toBeNull()
  })
  it('rejects non-handicaps', () => {
    expect(parseHcp('abc')).toBeNaN()
    expect(parseHcp('60')).toBeNaN()
    expect(parseHcp('+11')).toBeNaN()
  })
  it('shows plus handicaps the golf way', () => {
    expect([fmtHcp(-2), fmtHcp(18.4), fmtHcp(0), fmtHcp(null)]).toEqual(['+2', '18.4', '0', '–'])
  })
})
