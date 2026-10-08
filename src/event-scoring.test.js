import { describe, it, expect } from 'vitest'
import { groupThru, groupStableford, groupBestBall, ryderMatches, teamStableford, scorePlayerEvent } from './event-scoring.js'

// 18 par-4 holes, SI 1..18 in order.
const FLAT = Array.from({ length: 18 }, (_, i) => ({ par: 4, si: i + 1 }))
const card = (...holes) => [...holes, ...Array(18 - holes.length).fill(null)]
const P = (name, team, courseHcp, ...holes) => ({ id: name, name, team, courseHcp, gross: card(...holes) })

describe('group thru', () => {
  it('counts holes everyone in the group has a score for', () => {
    expect(groupThru([P('a', 'A', 0, 4, 4, 4), P('b', 'A', 0, 4, 4)])).toBe(2)
    expect(groupThru([P('a', 'A', 0)])).toBe(0)
  })
})

describe('four-ball v four-ball Stableford', () => {
  const g1 = { key: 'g1', name: '08:10', players: [P('a1', 'g1', 0, 3, 4), P('a2', 'g1', 0, 4, 4), P('a3', 'g1', 0, 5, 4), P('a4', 'g1', 0, 6, 4)] }
  const g2 = { key: 'g2', name: '08:20', players: [P('b1', 'g2', 0, 4, 4), P('b2', 'g2', 0, 4), P('b3', 'g2', 0, 4, 4), P('b4', 'g2', 0, 4, 4)] }

  it('best 2 per hole', () => {
    // 08:10: hole 1 points 3,2,1,0 → best two 5; hole 2 all par → 4. Total 9 thru 2.
    // 08:20: b2 hasn't scored hole 2, so only hole 1 counts: 2+2 = 4 thru 1.
    const rows = groupStableford(FLAT, [g1, g2], 1, 2)
    expect(rows.map(r => [r.name, r.total, r.thru, r.pos])).toEqual([['08:10', 9, 2, 1], ['08:20', 4, 1, 2]])
  })

  it('all 4 count', () => {
    const rows = groupStableford(FLAT, [g1, g2], 1, Infinity)
    expect(rows.map(r => [r.name, r.total])).toEqual([['08:10', 14], ['08:20', 8]])
  })

  it('shots apply', () => {
    // Course handicap 18 at 100%: a shot on every hole, so a 5 is a net par, 2 points.
    const g = { key: 'g', name: 'g', players: [P('x', 'g', 18, 5), P('y', 'g', 18, 5)] }
    expect(groupStableford(FLAT, [g], 1, 2)[0].total).toBe(4)
  })

  it('ties share a place', () => {
    const a = { key: 'a', name: 'a', players: [P('x', 'a', 0, 4), P('y', 'a', 0, 4)] }
    const b = { key: 'b', name: 'b', players: [P('z', 'b', 0, 4), P('w', 'b', 0, 4)] }
    expect(groupStableford(FLAT, [a, b], 1, 2).map(r => [r.pos, r.tied])).toEqual([[1, true], [1, true]])
  })
})

describe('four-ball v four-ball match play (best ball)', () => {
  it('lowest net in either group wins the hole; shots off the low across both groups', () => {
    // Playing handicaps off the low: A 0, 0; B 2, 4.
    // Hole 1 (SI 1): A best 4; B 5−1, 6−1 → 4. Halved.
    // Hole 2 (SI 2): A 4; B 4−1 = 3. B wins.
    // Hole 3 (SI 3): A 3; B 5 (no shot), 5−1 = 4 → 4. A wins. All square.
    // A has also played hole 4 but B hasn't, so it doesn't count yet.
    const ga = { key: 'A', name: '08:10', players: [P('a1', 'A', 0, 4, 4, 3, 4), P('a2', 'A', 0, 5, 4, 5, 4)] }
    const gb = { key: 'B', name: '08:20', players: [P('b1', 'B', 2, 5, 4, 5), P('b2', 'B', 4, 6, 6, 5)] }
    const m = groupBestBall(FLAT, [ga, gb], 1)
    expect(m).toMatchObject({ thru: 3, diff: 0, text: 'All square', running: [0, -1, 0], ahead: { A: 4, B: 3 } })
  })
})

describe('Ryder Cup', () => {
  const g1 = { key: 'g1', name: '08:10', players: [P('a1', 'A', 0, 3, 4), P('a2', 'A', 0, 5, 4), P('b1', 'B', 0, 4, 4), P('b2', 'B', 0, 4, 4)] }
  const g2 = { key: 'g2', name: '08:20', players: [P('c1', 'A', 0), P('c2', 'B', 0), P('c3', 'A', 0), P('c4', 'B', 0)] }

  it('a better-ball match in each four-ball, team points projected and confirmed', () => {
    const r = ryderMatches(FLAT, [g1, g2], 'bbl', 0.9)
    expect(r.matches[0]).toMatchObject({ a: ['a1', 'a2'], b: ['b1', 'b2'], res: { st: 'live', d: 1, thru: 2, txt: '1 up' } })
    expect(r.matches[1]).toMatchObject({ a: ['c1', 'c3'], b: ['c2', 'c4'], res: { st: 'ns' } })
    expect(r.score).toEqual({ cA: 0, cB: 0, pA: 1, pB: 0, tot: 2, toWin: 1.5 })
  })

  it('a finished match is a confirmed point; a half is ½ each', () => {
    const halved = Array(18).fill(4)
    const won = [...Array(17).fill(4), 5]
    const g3 = { key: 'g3', name: '08:30', players: [P('d1', 'A', 0, ...won), P('d2', 'A', 0, ...won), P('d3', 'B', 0, ...halved), P('d4', 'B', 0, ...halved)] }
    const g4 = { key: 'g4', name: '08:40', players: [P('e1', 'A', 0, ...halved), P('e2', 'A', 0, ...halved), P('e3', 'B', 0, ...halved), P('e4', 'B', 0, ...halved)] }
    const r = ryderMatches(FLAT, [g3, g4], 'bbscr', 0)
    expect(r.matches.map(m => [m.res.st, m.res.txt])).toEqual([['done', '1 up'], ['done', 'Halved']])
    expect(r.score).toMatchObject({ cA: 0.5, cB: 1.5 })
  })

  it('Stableford better ball compares points, not net', () => {
    // a1 with 2 shots on SI 1 scores 5 = net 3 = 3 pts; b1 a scratch 3 = 3 pts. Halved on points.
    const g = { key: 'g', name: 'g', players: [P('a1', 'A', 36, 5), P('a2', 'A', 0, 6), P('b1', 'B', 0, 3), P('b2', 'B', 0, 6)] }
    expect(ryderMatches(FLAT, [g], 'bbstab', 1).matches[0].res).toMatchObject({ d: 0, thru: 1 })
  })
})

describe('own teams Stableford', () => {
  it('everyone’s points count for their team', () => {
    const g1 = { key: 'g1', name: '08:10', players: [P('a', 'A', 0, 3, 4), P('b', 'B', 0, 4, 4)] }
    const g2 = { key: 'g2', name: '08:20', players: [P('c', 'B', 0, 5), P('d', 'A', 0, 4)] }
    const r = teamStableford(FLAT, [g1, g2], 1)
    expect(r.totals).toEqual({ A: 3 + 2 + 2, B: 2 + 2 + 1 })
    expect(r.players[0]).toMatchObject({ name: 'a', pts: 5, thru: 2 })
  })
})

describe('scorePlayerEvent picks the right rules', () => {
  const g = { key: 'g', name: 'g', players: [P('x', 'A', 0, 4), P('y', 'B', 0, 4)] }
  it.each([
    [{ style: 'fourball', format: 'best2' }, 'table'],
    [{ style: 'fourball', format: 'bestball' }, 'match'],
    [{ style: 'ryder', format: 'bbl' }, 'ryder'],
    [{ style: 'teams', format: 'teamstab' }, 'teams'],
  ])('%o → %s', (ev, kind) => {
    const groups = ev.format === 'bestball' ? [g, { ...g, key: 'h' }] : [g]
    expect(scorePlayerEvent(ev, FLAT, groups, 1).kind).toBe(kind)
  })
})

import { buildEventGroups } from './event-scoring.js'
describe('reading scores from each group’s card', () => {
  const tee = { slope: 113, rating: 72, par: 72 } // course handicap = index
  const event = {
    style: 'ryder', teamNames: { A: 'Blues', B: 'Reds' },
    groups: [{ slot: 10, time: 490 }, { slot: 20, time: 500 }],
    players: [
      { id: 101, name: 'Gary', memberId: 0, guest: false, slot: 10, team: 'A' },
      { id: 102, name: 'Sam (guest)', memberId: null, guest: true, slot: 10, team: 'B' },
      { id: 201, name: 'Aoife', memberId: 2, guest: false, slot: 20, team: 'A' },
    ],
  }
  // Card order differs from booking order; hole 3 entered but not saved.
  const cards = { 10: { lineup: [{ g: 102 }, { m: 0 }], scores: FLAT.map((_, i) => [5 + i % 2, 4]), done: FLAT.map((_, i) => i < 2) } }
  const groups = buildEventGroups(event, FLAT, tee, cards, p => (p.guest ? null : 10))

  it('matches members by member id and guests by booking, whatever the card order', () => {
    expect(groups[0].players.map(p => [p.name, p.gross.slice(0, 3)])).toEqual([['Gary', [4, 4, null]], ['Sam (guest)', [5, 6, null]]])
  })
  it('only saved holes count', () => expect(groups[0].players[0].gross.filter(x => x != null)).toHaveLength(2))
  it('a group without a card has no scores yet', () => {
    expect(groups[1]).toMatchObject({ hasCard: false })
    expect(groups[1].players[0].gross.every(x => x === null)).toBe(true)
  })
  it('guests without a handicap play off 0; teams carried through', () => {
    expect(groups[0].players.map(p => [p.courseHcp, p.team])).toEqual([[10, 'A'], [0, 'B']])
  })
})

import { grossOnDay, scoreAdvanceEvent } from './event-scoring.js'
describe('events set up in advance', () => {
  const players = { 1: 'Declan', 2: 'Aoife', 3: 'Ciarán', 4: 'Siobhán' }
  const player = id => ({ name: players[id] ?? 'Nobody', courseHcp: 0 })
  // Cards on day 1: Declan and Ciarán on one card, Aoife and Siobhán on another (different tee times).
  const card = (ids, rows) => ({ lineup: ids.map(m => ({ m })), scores: FLAT.map((_, i) => rows[i] ?? ids.map(() => 4)), done: FLAT.map((_, i) => i < rows.length) })
  const day1 = [card([1, 3], [[3, 4], [4, 5]]), card([2, 4], [[4, 4], [4, 4]])]

  it('reads each member’s scores from whichever card they’re on', () => {
    expect(grossOnDay(day1, 2, FLAT).slice(0, 3)).toEqual([4, 4, null])
    expect(grossOnDay(day1, 9, FLAT).every(x => x === null)).toBe(true)
  })

  it('Ryder Cup: a drawn match is scored even when the four are on different cards', () => {
    const ev = { style: 'ryder', fmt: 'bbscr', days: 2, players: [1, 2, 3, 4], team: { 1: 'A', 3: 'A', 2: 'B', 4: 'B' },
      matches: { 1: [{ a: [1, 3], b: [2, 4] }], 2: [{ a: [1, 2], b: [3, 4] }] } }
    const r = scoreAdvanceEvent(ev, FLAT, { 1: day1 }, player, 0)
    // Hole 1: A best 3 v B 4 → A. Hole 2: A best 4 v B 4 → halved. A 1 up thru 2.
    expect(r.byDay[1][0].res).toMatchObject({ st: 'live', d: 1, thru: 2 })
    expect(r.byDay[2][0].res.st).toBe('ns') // no cards on day 2 yet
    expect(r.score).toMatchObject({ pA: 1, pB: 0, tot: 2 })
  })

  it('Team Stableford adds everyone’s points across the days', () => {
    const ev = { style: 'teams', fmt: 'teamstab', days: 2, players: [1, 2, 3, 4], team: { 1: 'A', 3: 'A', 2: 'B', 4: 'B' }, matches: {} }
    const day2 = [card([1], [[4]])]
    const r = scoreAdvanceEvent(ev, FLAT, { 1: day1, 2: day2 }, player, 1)
    // A: Declan 3+2 (day 1) + 2 (day 2) = 7, Ciarán 2+1 = 3 → 10. B: Aoife 4, Siobhán 4 → 8.
    expect(r.totals).toEqual({ A: 10, B: 8 })
    expect(r.players[0]).toMatchObject({ name: 'Declan', pts: 7 })
  })

  it('Individual Stableford: highest first; not started go last', () => {
    const ev = { style: 'individual', fmt: 'stab', days: 1, players: [1, 2, 3, 4, 9], team: {}, matches: {} }
    const r = scoreAdvanceEvent(ev, FLAT, { 1: day1 }, player, 1)
    expect(r.rows.map(x => [x.name, x.pts, x.pos])).toEqual([['Declan', 5, 1], ['Aoife', 4, 2], ['Siobhán', 4, 2], ['Ciarán', 3, 4], ['Nobody', 0, null]])
    expect(r.rows[1].tied).toBe(true)
  })

  it('Individual net: lowest to par first', () => {
    const ev = { style: 'individual', fmt: 'net', days: 1, players: [1, 3], team: {}, matches: {} }
    const r = scoreAdvanceEvent(ev, FLAT, { 1: day1 }, player, 1)
    expect(r.rows.map(x => [x.name, x.net])).toEqual([['Declan', -1], ['Ciarán', 1]])
  })
})
