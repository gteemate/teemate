import { describe, it, expect } from 'vitest'
import { countsForOptions } from './round.js'

const D = '2026-10-09' // a Friday
const lineup = [{ m: 1 }, { m: 2 }, { g: 50 }]
const league = over => ({ id: 2, name: 'Winter League', style: 'league', club: true, startDate: '2026-10-05', weeks: 6, players: [1, 2, 3], ...over })
const event = over => ({ id: 7, name: 'Friday Roll-up', style: 'individual', startDate: D, days: 1, players: [1, 3], entryRequired: true, ...over })

describe('countsForOptions: what "Scoring round?" offers', () => {
  it('nothing on: nothing to ask', () => expect(countsForOptions({ lineup, events: [], leagueEntries: [], date: D })).toEqual([]))
  it('a league this week, for the players on the card who are in it', () => {
    expect(countsForOptions({ lineup, events: [league()], leagueEntries: [], date: D })).toEqual([{ kind: 'league', e: league(), players: [1, 2], week: 1 }])
  })
  it('a league: players who already counted a round this week are left out', () => {
    const r = countsForOptions({ lineup, events: [league()], leagueEntries: [{ eventId: 2, week: 1, memberId: 2, roundId: 99 }], date: D })
    expect(r[0].players).toEqual([1])
  })
  it('a league everyone on the card has already counted this week: not offered', () => {
    const done = [1, 2].map(m => ({ eventId: 2, week: 1, memberId: m, roundId: 99 }))
    expect(countsForOptions({ lineup, events: [league()], leagueEntries: done, date: D })).toEqual([])
  })
  it('an event on today that needs ticking, for the card\'s players in it', () => {
    expect(countsForOptions({ lineup, events: [event()], leagueEntries: [], date: D })).toEqual([{ kind: 'event', e: event(), players: [1], day: 1 }])
  })
  it('not offered: events that count every card anyway, ones not on today, leagues not running, nobody on the card in it', () => {
    const r = countsForOptions({ lineup, date: D, leagueEntries: [], events: [
      event({ entryRequired: false }), event({ id: 8, startDate: '2026-10-10' }), league({ id: 3, startDate: '2026-11-02' }), event({ id: 9, players: [3] }),
    ] })
    expect(r).toEqual([])
  })
})

import { roundBoard } from './round.js'
describe('roundBoard: the Leaderboard tab in a round (null = general round, no tab)', () => {
  const base = { cardId: 9, lineup: [{ m: 1 }, { m: 2 }], events: [], leagueEntries: [], eventEntries: [], playerEvents: [], date: D }
  it('general round: no leaderboard', () => expect(roundBoard(base)).toBeNull())
  it('this card counts for a league: its board', () => expect(roundBoard({ ...base, leagueEntries: [{ eventId: 2, week: 1, memberId: 1, roundId: 9 }] })).toEqual({ view: 'evboard', id: 2 }))
  it('a league entry for another card does not count', () => expect(roundBoard({ ...base, leagueEntries: [{ eventId: 2, week: 1, memberId: 1, roundId: 8 }] })).toBeNull())
  it('this card ticked for an event: its board', () => expect(roundBoard({ ...base, eventEntries: [{ eventId: 7, day: 1, memberId: 2, roundId: 9 }] })).toEqual({ view: 'evboard', id: 7 }))
  it('an accepted match today with someone on the card: the match board', () => {
    const pe = { id: 5, date: D, status: 'accepted', players: [{ memberId: 2 }] }
    expect(roundBoard({ ...base, playerEvents: [pe] })).toEqual({ view: 'pevent', id: 5 })
    expect(roundBoard({ ...base, playerEvents: [{ ...pe, status: 'pending' }] })).toBeNull()
  })
  it('an older event that counts every card, on today, with someone on the card in it', () => {
    expect(roundBoard({ ...base, events: [event({ id: 4, entryRequired: false, players: [2] })] })).toEqual({ view: 'evboard', id: 4 })
    expect(roundBoard({ ...base, events: [event({ id: 4, entryRequired: true, players: [2] })] })).toBeNull() // needs a tick
  })
})
