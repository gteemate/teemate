import { describe, it, expect } from 'vitest'
import {
  courseHandicap, playingHandicaps, shotsOnHole, stablefordPoints, holeCalc, betterBallWinner,
  matchProgress, skins, gameState, roundSummary, toPar, teamEventScore, fmtPts, upText,
} from './scoring.js'

const WHITE = { slope: 130, rating: 72, par: 71 }
// 18 par-4 holes with SI 1..18 in order keeps hand calculations simple.
const FLAT = Array.from({ length: 18 }, (_, i) => ({ par: 4, si: i + 1 }))
const rows = (n, row) => Array.from({ length: n }, () => [...row])

describe('handicaps and shots', () => {
  it('course handicap from index, slope and rating', () => {
    expect(courseHandicap(12.4, WHITE)).toBe(15) // 14.27 + 1
    expect(courseHandicap(2.1, WHITE)).toBe(3) // 2.42 + 1
    expect(courseHandicap(24.8, WHITE)).toBe(30) // 28.53 + 1
    expect(courseHandicap(-1.5, WHITE)).toBe(-1) // plus index
  })

  it('playing handicaps with allowance, off the low', () => {
    expect(playingHandicaps([15, 3, 30, 10], 0.9)).toEqual([14, 3, 27, 9])
    expect(playingHandicaps([15, 3, 30, 10], 0.9, true)).toEqual([11, 0, 24, 6])
    expect(playingHandicaps([15, 3], 0)).toEqual([0, 0]) // scratch
  })

  it('shots on a hole by stroke index', () => {
    expect(shotsOnHole(0, 1)).toBe(0)
    expect(shotsOnHole(5, 5)).toBe(1)
    expect(shotsOnHole(5, 6)).toBe(0)
    expect(shotsOnHole(18, 18)).toBe(1)
    expect([1, 2, 3].map(si => shotsOnHole(20, si))).toEqual([2, 2, 1])
    expect(shotsOnHole(36, 18)).toBe(2)
  })

  it('plus handicaps give shots back from SI 18', () => {
    expect(shotsOnHole(-2, 18)).toBe(-1)
    expect(shotsOnHole(-2, 17)).toBe(-1)
    expect(shotsOnHole(-2, 16)).toBe(0)
  })

  it('a full handicap totals the right shots over 18 holes', () => {
    for (const ph of [0, 7, 18, 25, 40, -3]) {
      expect(FLAT.reduce((t, h) => t + shotsOnHole(ph, h.si), 0)).toBe(ph)
    }
  })
})

describe('Stableford', () => {
  it('points per hole', () => {
    expect(stablefordPoints(4, 4, 0)).toBe(2) // par
    expect(stablefordPoints(5, 4, 1)).toBe(2) // net par
    expect(stablefordPoints(3, 4, 0)).toBe(3) // birdie
    expect(stablefordPoints(2, 4, 0)).toBe(4) // eagle
    expect(stablefordPoints(4, 4, 1)).toBe(3) // net birdie
    expect(stablefordPoints(6, 4, 0)).toBe(0) // double bogey
    expect(stablefordPoints(9, 4, 1)).toBe(0) // never negative
    expect(stablefordPoints(null, 4, 1)).toBe(0) // no score / picked up
  })

  it('individual Stableford totals over holes played', () => {
    const phs = [0, 18, 0, 0]
    const s = gameState({ kind: 'stab' }, FLAT, phs, rows(18, [4, 5, 3, 7]), 2)
    expect(s.totals).toEqual([4, 4, 6, 0])
    expect(s.holes).toEqual([{ pts: 2 }, { pts: 2 }])
    expect(s.finished).toBe(false)
  })
})

describe('match play', () => {
  it('better-ball hole: lowest net per side, shots applied', () => {
    // B1 gets a shot on SI 1, so their 5 is a net 4 and halves A's 4.
    const c = holeCalc({ par: 4, si: 1 }, [4, 5, 5, 5], [0, 0, 1, 0])
    expect(c.nA).toBe(4)
    expect(c.nB).toBe(4)
    expect(betterBallWinner(c)).toBe(0)
    expect(betterBallWinner(holeCalc({ par: 4, si: 2 }, [4, 5, 5, 5], [0, 0, 1, 0]))).toBe(1)
  })

  it('better-ball on Stableford points', () => {
    const c = holeCalc({ par: 4, si: 1 }, [5, 6, 4, 6], [1, 0, 0, 0], [0, 1, 2, 3])
    expect([c.pA, c.pB]).toEqual([2, 2])
    expect(betterBallWinner(c, 'pts')).toBe(0)
  })

  it('pairings decide who is on which side', () => {
    const c = holeCalc({ par: 4, si: 1 }, [4, 5, 3, 6], [0, 0, 0, 0], [0, 2, 1, 3]) // me & player 2 v 1 & 3
    expect(betterBallWinner(c)).toBe(1)
  })

  it('closes out early: 5 up with 4 to play is 5&4', () => {
    const m = matchProgress([1, 1, 1, 1, 1, ...Array(13).fill(0)])
    expect(m).toMatchObject({ diff: 5, thru: 14, over: true, finished: true, text: '5&4', lead: 'A' })
  })

  it('stops counting holes after the match is decided', () => {
    const m = matchProgress([...Array(10).fill(-1), 1, 1, 1, 1, 1, 1, 1, 1])
    expect(m).toMatchObject({ diff: -10, thru: 10, text: '10&8', lead: 'B' })
  })

  it('a match won on the last hole is "1 up", not "1&0"', () => {
    const m = matchProgress([...Array(17).fill(0), 1])
    expect(m).toMatchObject({ diff: 1, thru: 18, over: false, finished: true, text: '1 up' })
  })

  it('all square after 18 is halved', () => {
    expect(matchProgress(Array(18).fill(0)).text).toBe('Halved')
  })

  it('part-way status', () => {
    const m = matchProgress([1, 0, 0])
    expect(m).toMatchObject({ thru: 3, finished: false, text: '1 up', running: [1, 1, 1] })
    expect(matchProgress([0, 0]).text).toBe('All square')
    expect([0, 2, -1].map(upText)).toEqual(['AS', '2 up', '1 dn'])
  })

  it('dormie is not over: 2 up with 2 to play', () => {
    const m = matchProgress([1, 1, ...Array(14).fill(0)])
    expect(m).toMatchObject({ thru: 16, over: false, finished: false })
  })

  it('gameState runs a better-ball match from gross scores', () => {
    const scores = rows(18, [4, 4, 4, 4])
    scores[0] = [3, 5, 4, 5] // A wins 1
    scores[1] = [5, 5, 4, 6] // B wins 2
    scores[2] = [4, 3, 4, 4] // A wins 3
    const s = gameState({ kind: 'match', cmp: 'net' }, FLAT, [0, 0, 0, 0], scores, 3)
    expect(s.holes.map(h => h.diff)).toEqual([1, 0, 1])
    expect(s.match).toMatchObject({ text: '1 up', thru: 3, finished: false })
  })
})

describe('skins', () => {
  it('ties carry over, a single low net takes the carried skins', () => {
    const s = skins([[4, 4, 5, 5], [3, 4, 4, 4], [4, 4, 4, 3], [4, 4, 5, 5]])
    expect(s.winners).toEqual([-1, 0, 3, -1])
    expect(s.totals).toEqual([2, 0, 0, 1])
    expect(s.carry).toBe(1)
  })

  it('uses nets: a shot can win a skin', () => {
    const scores = [[4, 4, 5, 5]]
    const s = gameState({ kind: 'skins' }, FLAT, [0, 1, 0, 0], scores, 1)
    expect(s.holes).toEqual([{ winner: 1 }])
    expect(s.totals).toEqual([0, 1, 0, 0])
  })
})

describe('cards with fewer than four players', () => {
  it('Stableford with two players', () => {
    const s = gameState({ kind: 'stab' }, FLAT, [0, 18], [[4, 5], [3, 6]], 2)
    expect(s.totals).toEqual([5, 3])
  })
  it('skins with three players', () => {
    const s = gameState({ kind: 'skins' }, FLAT, [0, 0, 0], [[4, 4, 5], [3, 4, 4]], 2)
    expect(s.holes.map(h => h.winner)).toEqual([-1, 0])
    expect(s.totals).toEqual([2, 0, 0])
  })
})

describe('net strokeplay and leaderboard', () => {
  it('net to par per player', () => {
    const s = gameState({ kind: 'stroke' }, FLAT, [0, 2, 0, 0], [[5, 5, 4, 3], [4, 5, 4, 3]], 2)
    expect(s.totals).toEqual([1, 0, 0, -2])
    expect(s.holes).toEqual([{ toPar: 1 }, { toPar: 0 }])
  })

  it('round summary: gross, net, points, birdies, eagles', () => {
    expect(roundSummary(FLAT, [3, 4, 5, 2], 0)).toEqual({ thru: 4, g: -2, n: -2, pts: 10, bd: 2, eag: 1 })
    // Course handicap 2: shots on SI 1 and 2.
    expect(roundSummary(FLAT, [5, 5, 5], 2)).toEqual({ thru: 3, g: 3, n: 1, pts: 5, bd: 0, eag: 0 })
  })

  it('to-par text', () => {
    expect([0, 3, -2].map(toPar)).toEqual(['E', '+3', '-2'])
  })
})

describe('team event points', () => {
  const matches = [
    { res: { st: 'done', d: 3 } }, // A wins
    { res: { st: 'live', d: -1 } }, // B leads
    { res: { st: 'ns' } }, // not started
    { res: { st: 'done', d: 0 } }, // halved
  ]

  it('confirmed counts finished matches, projected adds live ones', () => {
    expect(teamEventScore(matches)).toEqual({ cA: 1.5, cB: 0.5, pA: 1.5, pB: 1.5, tot: 4, toWin: 2.5 })
  })

  it('a live all-square match projects half each', () => {
    expect(teamEventScore([{ res: { st: 'live', d: 0 } }])).toMatchObject({ pA: 0.5, pB: 0.5, cA: 0, cB: 0 })
  })

  it('points to win is a majority', () => {
    expect(teamEventScore(Array(6).fill({ res: { st: 'ns' } })).toWin).toBe(3.5)
    expect(teamEventScore([]).toWin).toBe(0.5)
  })

  it('formats halves', () => {
    expect([2, 1.5, 0.5, 0].map(fmtPts)).toEqual(['2', '1½', '½', '0'])
  })
})
