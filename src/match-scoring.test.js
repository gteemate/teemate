import { describe, it, expect } from 'vitest'
import { DEFAULT_POINTS, matchType, dayRules, shotsOn, holeRanks, scoreMatch, matchPoints } from './match-scoring.js'
import { shotsOnHole } from './scoring.js'
import { ryderMatches, singlesMatch } from './event-scoring.js'

const HOLES = Array.from({ length: 18 }, (_, i) => ({ par: [4, 4, 3, 5][i % 4], si: [7, 1, 15, 11, 3, 17, 9, 5, 13, 8, 2, 16, 12, 4, 18, 10, 6, 14][i] }))
const ALLOW = { four: 0.9, singles: 1, stab: 0.95 }
// A made-up card: gross per hole from a seed, thru `n` holes.
const card = (seed, n = 18) => HOLES.map((h, i) => (i < n ? h.par + ((seed * 7 + i * 3) % 4) - 1 : null))
const P = (id, courseHcp, seed, n) => ({ id, name: `P${id}`, courseHcp, gross: card(seed, n) })

describe('the same results as before over 18 holes', () => {
  for (const fmt of ['bbl', 'bbstab', 'bbscr']) {
    for (const [s, n] of [[1, 18], [2, 11], [5, 18], [9, 3]]) {
      it(`four-ball ${fmt}, cards ${s} thru ${n}`, () => {
        const a = [P(1, 8, s, n), P(2, 20, s + 1, n)], b = [P(3, 12, s + 2, n), P(4, 3, s + 3, n)]
        const old = ryderMatches(HOLES, [{ key: 'k', name: 'M', players: [...a.map(p => ({ ...p, team: 'A' })), ...b.map(p => ({ ...p, team: 'B' }))] }], fmt, ALLOW.four).matches[0].res
        expect(scoreMatch({ holes: HOLES, a, b, fmt, allow: ALLOW }).res).toEqual(old)
      })
      it(`singles ${fmt}, cards ${s} thru ${n}`, () => {
        const a = [P(1, 8, s, n)], b = [P(3, 24, s + 2, n)]
        const single = { bbl: 'kos', bbstab: 'sm2', bbscr: 'sc2' }[fmt]
        const old = singlesMatch(HOLES, [{ players: [a[0]] }, { players: [b[0]] }], single, ALLOW.singles)
        expect(scoreMatch({ holes: HOLES, a, b, fmt, allow: ALLOW }).res).toMatchObject({ d: old.diff, txt: old.text, thru: old.thru })
      })
    }
  }
})

describe('shots on a hole', () => {
  it('over 18 holes, the same as before', () => {
    for (let ph = -5; ph <= 40; ph++) for (let si = 1; si <= 18; si++) expect(shotsOn(ph, si, 18)).toBe(shotsOnHole(ph, si))
  })
  it('ranks the holes played by stroke index', () => {
    expect(holeRanks(HOLES, 4)).toEqual([2, 1, 4, 3])
  })
  it('a plus handicap on 9 holes gives back on the two highest-ranked holes', () => {
    const r = holeRanks(HOLES, 9)
    expect(r.map(k => shotsOn(-2, k, 9))).toEqual(r.map(k => (k >= 8 ? -1 : 0)))
  })
})

describe('match types and the day’s rules', () => {
  it('names the type from the sides', () => {
    expect(matchType({ a: [1, 2], b: [3, 4] })).toBe('four')
    expect(matchType({ a: [1], b: [3] })).toBe('singles')
    expect(matchType({ a: [1, 2], b: [3] })).toBe('three')
    expect(matchType({ a: [1], b: [3, 4] })).toBe('three')
  })
  it('the event’s points over the defaults, and a day’s rules over those', () => {
    const e = { points: { four: 1.5 }, dayRules: { 9: { holes: 12, points: { four: 2 } } } }
    expect(dayRules(e, 1)).toEqual({ holes: 18, points: { ...DEFAULT_POINTS, four: 1.5 } })
    expect(dayRules(e, 9)).toEqual({ holes: 12, points: { ...DEFAULT_POINTS, four: 2 } })
  })
})

describe('3-balls', () => {
  const pts = DEFAULT_POINTS // pair 1, single 2
  const even = (id, gross) => ({ id, courseHcp: 0, gross })
  const all = v => HOLES.map(h => h.par + v)
  it('the single wins: their team gets 2 (single on team B)', () => {
    const r = scoreMatch({ holes: HOLES, a: [even(1, all(1)), even(2, all(1))], b: [even(3, all(0))], fmt: 'bbscr', allow: ALLOW, points: pts })
    expect(matchPoints(r)).toMatchObject({ pA: 0, pB: 2, cB: 2 })
  })
  it('the pair wins: their team gets 1 (single on team A)', () => {
    const r = scoreMatch({ holes: HOLES, a: [even(1, all(1))], b: [even(2, all(0)), even(3, all(2))], fmt: 'bbscr', allow: ALLOW, points: pts })
    expect(matchPoints(r)).toMatchObject({ pA: 0, pB: 1 })
  })
  it('halved: each side half its own win points', () => {
    const r = scoreMatch({ holes: HOLES, a: [even(1, all(0)), even(2, all(1))], b: [even(3, all(0))], fmt: 'bbscr', allow: ALLOW, points: pts })
    expect(matchPoints(r)).toMatchObject({ pA: 0.5, pB: 1, cA: 0.5, cB: 1 })
  })
})

describe('Stableford total', () => {
  const even = (id, gross) => ({ id, courseHcp: 0, gross })
  it('running totals while playing, decided at the end', () => {
    const half = v => HOLES.map((h, i) => (i < 9 ? h.par + v : null))
    const live = scoreMatch({ holes: HOLES, a: [even(1, half(0)), even(2, half(1))], b: [even(3, half(1)), even(4, half(1))], fmt: 'stabtot', allow: ALLOW })
    expect(live.res).toMatchObject({ st: 'live', thru: 9, d: 9, txt: '18 – 9' })
    const full = v => HOLES.map(h => h.par + v)
    const done = scoreMatch({ holes: HOLES, a: [even(1, full(0)), even(2, full(1))], b: [even(3, full(1)), even(4, full(1))], fmt: 'stabtot', allow: ALLOW })
    expect(done.res).toMatchObject({ st: 'done', d: 18, txt: '36 – 18' })
  })
})

describe('a short day', () => {
  it('12 holes: shots scaled, only holes 1–12 count, decided over 12', () => {
    const r = scoreMatch({ holes: HOLES, holesPlayed: 12, a: [P(1, 18, 1)], b: [P(2, 0, 1)], fmt: 'bbscr', allow: ALLOW })
    expect(r.res.thru).toBeLessThanOrEqual(12)
    expect(r.res.st).toBe('done')
    const s = scoreMatch({ holes: HOLES, holesPlayed: 12, a: [P(1, 18, 1)], b: [P(2, 0, 1)], fmt: 'bbl', allow: { ...ALLOW, singles: 1 } })
    expect(s.ph[1]).toBe(12) // 18 shots off the low over 18 holes → 12 over 12
  })
  it('“3&2” over 12 holes', () => {
    const a = HOLES.map((h, i) => (i < 12 ? h.par - (i < 3 ? 1 : 0) : null)), b = HOLES.map((h, i) => (i < 12 ? h.par : null))
    const r = scoreMatch({ holes: HOLES, holesPlayed: 12, a: [{ id: 1, courseHcp: 0, gross: a }], b: [{ id: 2, courseHcp: 0, gross: b }], fmt: 'bbscr', allow: ALLOW })
    expect(r.res).toMatchObject({ st: 'done', txt: '3&2', d: 3, thru: 10 })
  })
})
