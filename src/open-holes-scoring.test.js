// Every scorer on the open holes only (holes 1–6 and 10–12 on the sample course), worked out by hand: a course
// handicap of 18 at 100% is 9 over 9 holes, one shot on each, so a par is a net birdie (3 points).
import { describe, it, expect } from 'vitest'
import { COURSE } from './sample-data.js'
import { openCourse } from './open-holes.js'
import { scoreAdvanceEvent, scoreLeague, scorePairsLeague } from './event-scoring.js'
import { scoreMatch } from './match-scoring.js'
import { koCardState } from './knockout.js'

const H = COURSE.holes
const ODD = [1, 2, 3, 4, 5, 6, 10, 11, 12]
const pars = (ids, done = () => true, extra = {}) => ({
  id: extra.id ?? 'c', lineup: ids.map(m => ({ m })),
  scores: H.map((h, i) => ids.map(() => extra[i + 1] ?? h.par)), done: H.map((_, i) => done(i + 1)),
})
const player = () => ({ name: 'P', courseHcp: 18 })
const ev = (o = {}) => ({ style: 'individual', fmt: 'stab', days: 1, startDate: '2026-12-20', players: [1], team: {}, matches: {}, holes: ODD, ...o })

describe('events on the open holes', () => {
  it('individual Stableford: 27 points over 9 open holes; a score on a closed hole doesn’t count', () => {
    const card = pars([1], () => true, { 8: 9 }) // a 9 on closed hole 8
    const r = scoreAdvanceEvent(ev(), H, { 1: [card] }, player, 1)
    expect(r.rows[0]).toMatchObject({ pts: 27 })
    expect(r.rows[0].perDay[0].thru).toBe(9)
  })
  it('net strokeplay: net −9', () => {
    expect(scoreAdvanceEvent(ev({ fmt: 'net' }), H, { 1: [pars([1])] }, player, 1).rows[0].net).toBe(-9)
  })
  it('team Stableford: each team the sum of its players over the open holes', () => {
    const r = scoreAdvanceEvent(ev({ style: 'teams', players: [1, 2, 3, 4], team: { 1: 'A', 2: 'A', 3: 'B', 4: 'B' } }), H, { 1: [pars([1, 2, 3, 4])] }, player, 1)
    expect(r.totals).toEqual({ A: 54, B: 54 })
  })
  it('two days: day 1 on the event’s holes, day 2 on its own', () => {
    const e = ev({ days: 2, dayRules: { 2: { holes: [1, 2, 3] } } })
    const r = scoreAdvanceEvent(e, H, { 1: [pars([1])], 2: [pars([1])] }, player, 1)
    expect(r.rows[0].perDay.map(d => [d.thru, d.pts])).toEqual([[9, 27], [3, 9]])
  })
  it('a match over 6 open holes: 3 up after 4 is 3&2', () => {
    const six = openCourse(H, [1, 2, 3, 4, 5, 6])
    const g = (d) => H.map((h, i) => (i < 4 ? h.par + d[i] : null))
    const r = scoreMatch({ holes: six, a: [{ id: 1, courseHcp: 0, gross: g([0, 0, 0, 0]) }], b: [{ id: 2, courseHcp: 0, gross: g([1, 1, 1, 0]) }], fmt: 'bbscr', allow: { four: 1, singles: 1, stab: 1 } })
    expect(r.res).toMatchObject({ st: 'done', txt: '3&2' })
  })
  it('a season day with its own holes counts only those on the match', () => {
    const e = { style: 'ryder', season: true, fmt: 'bbscr', startDate: '2026-12-01', days: 9, players: [1, 2], team: { 1: 'A', 2: 'B' }, matches: { 1: [{ a: [1], b: [2] }] }, dayRules: { 1: { holes: [10, 11, 12] } } }
    const c = { id: 'c', lineup: [{ m: 1 }, { m: 2 }], scores: H.map((h, i) => [h.par, i >= 9 && i <= 11 ? h.par + 1 : h.par - 1]), done: H.map(() => true) }
    const m = scoreAdvanceEvent(e, H, { 1: [c] }, player, 1).byDay[1][0]
    expect(m.res).toMatchObject({ st: 'done', d: 2, txt: '2&1' }) // won 10 and 11: 2 up with 1 to play
  })
})

describe('leagues and knockouts on the open holes', () => {
  const league = { weeks: 2, bestOf: 1, teams: [{ name: 'T', col: '#fff' }], team: { 1: 0 }, players: [1], dayRules: { 2: { holes: [10, 11, 12, 13, 14, 15, 16, 17, 18] } } }
  it('a league week with its own holes: week 1 over 18, week 2 over the back 9', () => {
    const entries = [{ week: 1, memberId: 1, roundId: 'a' }, { week: 2, memberId: 1, roundId: 'b' }]
    const r = scoreLeague(league, H, entries, { a: pars([1]), b: pars([1]) }, player, 1)
    expect(r.players[0].perWeek).toEqual({ 1: { pts: 54, thru: 18, done: true, live: false }, 2: { pts: 27, thru: 9, done: true, live: false } })
  })
  it('a pairs league week on its own holes', () => {
    const e = { ...league, leaguePairs: [[1, 2]] }
    const entries = [{ week: 2, memberId: 1, roundId: 'b' }, { week: 2, memberId: 2, roundId: 'b' }]
    expect(scorePairsLeague(e, H, entries, { b: pars([1, 2]) }, player, 1)[0].perWeek).toEqual({ 2: { pts: 27, thru: 9, done: true } })
  })
  it('a knockout round on the back 9 is finished after the 18th, on those holes’ scores', () => {
    const card = { lineup: [{ m: 1 }, { m: 2 }], scores: H.map((h, i) => [h.par, i >= 9 ? h.par + 1 : h.par - 1]), done: H.map((_, i) => i >= 9) }
    const s = koCardState(card, openCourse(H, [10, 11, 12, 13, 14, 15, 16, 17, 18]), [[1], [2]], () => 0, { cmp: 'net', allow: 1, offLow: true })
    expect(s).toMatchObject({ thru: 5, finished: true, text: '5&4', lead: 0 })
    expect(s.players[0].gross).toEqual(H.slice(9).map(h => h.par)) // the back 9's scores, in order
  })
})
