import { describe, it, expect } from 'vitest'
import { roundName, myNextMatch, entryName, matchState, champion } from './knockout.js'

describe('roundName', () => {
  it('counts back from the final', () => {
    expect([1, 2, 3, 4, 5, 6].map(r => roundName(r, 6))).toEqual(['Round of 64', 'Round of 32', 'Round of 16', 'Quarter-finals', 'Semi-finals', 'Final'])
    expect([1, 2, 3].map(r => roundName(r, 3))).toEqual(['Quarter-finals', 'Semi-finals', 'Final'])
  })
})

const m = (o) => ({ id: 1, round: 1, slot: 0, aEntry: 10, bEntry: 11, winnerEntry: null, result: null, status: 'open', reportedEntry: null, ...o })

describe('myNextMatch: what goes at the top', () => {
  it('my earliest match without a result', () => {
    const ms = [m({ id: 1, status: 'confirmed', winnerEntry: 10 }), m({ id: 2, round: 2, aEntry: 10, bEntry: null }), m({ id: 3, aEntry: 12, bEntry: 13 })]
    expect(myNextMatch(ms, 10).id).toBe(2)
  })
  it("knocked out, or it's all over: none", () => {
    expect(myNextMatch([m({ status: 'confirmed', winnerEntry: 11 })], 10)).toBeNull()
    expect(myNextMatch([], 10)).toBeNull()
  })
})

describe('matchState: what I can do', () => {
  it('open with both sides: report', () => expect(matchState(m(), 10)).toBe('report'))
  it('waiting for the opponent to be known', () => expect(matchState(m({ bEntry: null }), 10)).toBe('waiting'))
  it('I reported: waiting for them to confirm', () => expect(matchState(m({ status: 'reported', reportedEntry: 10 }), 10)).toBe('reported'))
  it('they reported: confirm or dispute', () => expect(matchState(m({ status: 'reported', reportedEntry: 11 }), 10)).toBe('confirm'))
  it('disputed: with the admin', () => expect(matchState(m({ status: 'disputed' }), 10)).toBe('disputed'))
  it('done', () => expect(matchState(m({ status: 'confirmed', winnerEntry: 10 }), 10)).toBe('done'))
})

describe('entryName and champion', () => {
  const entries = [{ id: 10, memberId: 1, partnerId: null }, { id: 11, memberId: 2, partnerId: 3 }]
  const members = [{ id: 1, name: 'Gary Cochrane' }, { id: 2, name: 'Peter Reid' }, { id: 3, name: 'Liam Quinn' }]
  it('a single, a pair, a bye, not known yet', () => {
    expect(entryName(10, entries, members)).toBe('Gary Cochrane')
    expect(entryName(11, entries, members)).toBe('Peter Reid & Liam Quinn')
    expect(entryName(null, entries, members, true)).toBe('Bye')
    expect(entryName(null, entries, members)).toBe('To be decided')
  })
  it('the champion: the final’s winner once confirmed', () => {
    expect(champion([m({ round: 3, status: 'confirmed', winnerEntry: 11 })], 3)).toBe(11)
    expect(champion([m({ round: 3, status: 'reported', winnerEntry: 11 })], 3)).toBeNull()
  })
})

import { spreadDates } from './knockout.js'
describe('spreadDates: play-by dates spread evenly to the finish', () => {
  it('5 rounds from 1 Nov to the end of January: the last is the finish date', () =>
    expect(spreadDates('2026-11-01', '2027-01-31', 5)).toEqual(['2026-11-19', '2026-12-07', '2026-12-26', '2027-01-13', '2027-01-31']))
  it('one round: the finish date', () => expect(spreadDates('2026-11-01', '2026-11-30', 1)).toEqual(['2026-11-30']))
  it('a finish before the start: nothing', () => expect(spreadDates('2026-11-01', '2026-10-01', 3)).toEqual([]))
})
