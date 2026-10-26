import { describe, it, expect } from 'vitest'
import { SINGLES_FMT, isSingles, matchDays, dayDate, dayOfDate, seasonEnd, dayStarted, playedIds, drawDay } from './season.js'

const season = { style: 'ryder', fmt: 'bbl', season: true, startDate: '2026-10-01', days: 100, entryRequired: true,
  team: { 1: 'A', 2: 'A', 3: 'B', 4: 'B' }, matches: { 1: [{ a: [1, 2], b: [3, 4] }], 4: [{ a: [1], b: [3] }], 7: [], 9: [{ a: [2], b: [4] }] } }

describe('season match days', () => {
  it('a season plays only on days with matches, in order', () => {
    expect(matchDays(season)).toEqual([1, 4, 9])
  })
  it('a one-off plays every day', () => {
    expect(matchDays({ style: 'ryder', days: 2, matches: { 1: [{ a: [1, 2], b: [3, 4] }] } })).toEqual([1, 2])
  })
  it('day numbers and dates go both ways', () => {
    expect(dayDate(season, 4)).toBe('2026-10-04')
    expect(dayOfDate(season, '2026-10-04')).toBe(4)
    expect(dayOfDate(season, '2026-09-30')).toBe(0)
    expect(seasonEnd(season)).toBe('2027-01-08')
  })
  it('a singles is one a side', () => {
    expect(isSingles({ a: [1], b: [3] })).toBe(true)
    expect(isSingles({ a: [1, 2], b: [3, 4] })).toBe(false)
    expect(SINGLES_FMT).toEqual({ bbl: 'kos', bbstab: 'sm2', bbscr: 'sc2' })
  })
})

describe('has a match day started', () => {
  const card = (id, ids, saved) => ({ id, lineup: ids.map(m => ({ m })), scores: [], done: Array.from({ length: 18 }, (_, i) => i < saved) })
  it('not until a counted card has a hole saved', () => {
    const cards = { 4: [card(7, [1, 9], 0)] }, entries = [{ day: 4, memberId: 1, roundId: 7 }]
    expect(dayStarted(season, 4, cards, entries)).toBe(false)
    expect(dayStarted(season, 4, { 4: [card(7, [1, 9], 1)] }, entries)).toBe(true)
  })
  it('a card nobody counted for the event doesn’t start it', () => {
    expect(dayStarted(season, 4, { 4: [card(7, [1, 9], 3)] }, [])).toBe(false)
  })
  it('players who have played: past match days and a started today', () => {
    const cards = { 4: [card(7, [1, 3], 2)] }, entries = [{ day: 4, memberId: 1, roundId: 7 }]
    expect([...playedIds(season, cards, entries, '2026-10-04')].sort()).toEqual([1, 2, 3, 4])
    expect([...playedIds(season, {}, [], '2026-10-04')].sort()).toEqual([1, 2, 3, 4]) // day 1 is past
    expect([...playedIds(season, {}, [], '2026-10-01')]).toEqual([])
  })
})

describe('drawing a match day', () => {
  const ids = ms => ms.flatMap(m => [...m.a, ...m.b])
  it('four-balls first, then a singles from one left over each side', () => {
    const ms = drawDay([1, 2, 3, 4, 5], [6, 7, 8, 9, 10])
    expect(ms.filter(m => !isSingles(m))).toHaveLength(2)
    expect(ms.filter(isSingles)).toHaveLength(1)
    expect(ids(ms).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })
  it('drawDay leaves the odd player out', () => {
    const A = [1, 2, 3, 4, 5, 6, 7], B = [8, 9, 10, 11, 12]
    const ms = drawDay(A, B)
    expect(ms.filter(m => !isSingles(m))).toHaveLength(2)
    expect(ms.filter(isSingles)).toHaveLength(1)
    expect(ids(ms).filter(id => A.includes(id))).toHaveLength(5)
    for (const m of ms) { expect(m.a.every(id => A.includes(id))).toBe(true); expect(m.b.every(id => B.includes(id))).toBe(true) }
  })
})

import { canChange } from './season.js'
describe('who can change an event', () => {
  const me = { id: 1, admin: false }, mine = over => ({ createdBy: { id: 1 }, startDate: '2026-10-01', days: 100, ...over })
  it('a one-off: its organiser until the first day; admins any time', () => {
    expect(canChange(mine({ days: 1, startDate: '2026-10-11' }), me, '2026-10-10')).toBe(true)
    expect(canChange(mine({ days: 1, startDate: '2026-10-10' }), me, '2026-10-10')).toBe(false)
    expect(canChange(mine({ days: 1 }), { id: 9, admin: true }, '2026-12-01')).toBe(true)
  })
  it('a season: its organiser until the end date, not after; nobody else', () => {
    expect(canChange(mine({ season: true }), me, '2027-01-08')).toBe(true)
    expect(canChange(mine({ season: true }), me, '2027-01-09')).toBe(false)
    expect(canChange(mine({ season: true }), { id: 2, admin: false }, '2026-10-10')).toBe(false)
  })
})
