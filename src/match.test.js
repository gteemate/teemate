import { describe, it, expect } from 'vitest'
import { myMatch, matchBooking } from './match.js'

const event = { matches: { 1: [{ a: [1, 2], b: [3, 4] }, { a: [5, 6], b: [7, 8] }], 2: [{ a: [1, 5], b: [3, 7] }] } }

describe('myMatch', () => {
  it('my match that day, numbered from 1', () => expect(myMatch(event, 1, 6)).toEqual({ no: 2, a: [5, 6], b: [7, 8] }))
  it('another day, another match', () => expect(myMatch(event, 2, 1)).toEqual({ no: 1, a: [1, 5], b: [3, 7] }))
  it('not drawn that day: null', () => { expect(myMatch(event, 2, 2)).toBeNull(); expect(myMatch(event, 3, 1)).toBeNull(); expect(myMatch({ matches: null }, 1, 1)).toBeNull() })
})

describe('matchBooking: where the four stand on the tee sheet', () => {
  const ids = [1, 2, 3, 4]
  const slot = (id, time, players, capacity = 4) => ({ id, time, capacity, players: players.map(memberId => ({ memberId })) })
  it('nobody booked: none', () => expect(matchBooking(ids, [slot(10, 490, [9])], 1)).toEqual({ kind: 'none' }))
  it('all four in one tee time: together', () => expect(matchBooking(ids, [slot(10, 490, [1, 2, 3, 4])], 1)).toEqual({ kind: 'together', slot: expect.objectContaining({ id: 10 }) }))
  it('me and one other booked, room for the rest: partial', () =>
    expect(matchBooking(ids, [slot(10, 490, [1, 3])], 1)).toEqual({ kind: 'partial', slot: expect.objectContaining({ id: 10 }), missing: [2, 4] }))
  it("no room for the rest on mine, and they aren't booked: busy (book the match at another time)", () =>
    expect(matchBooking(ids, [slot(10, 470, [1, 9, 8, 7])], 1)).toEqual({ kind: 'busy', slot: expect.objectContaining({ id: 10, time: 470 }) }))
  it('no room on mine, and one of them is already on it with me: split (sort it out between you)', () =>
    expect(matchBooking(ids, [slot(10, 490, [1, 3, 9])], 1).kind).toBe('split'))
  it('someone booked in another tee time: split, saying who and when', () =>
    expect(matchBooking(ids, [slot(10, 490, [1, 2]), slot(11, 500, [3])], 1)).toEqual({ kind: 'split', clash: { id: 3, time: 500 } }))
  it("others booked but I'm not: split (they book, or I join them)", () => expect(matchBooking(ids, [slot(11, 500, [3, 4])], 1)).toEqual({ kind: 'split', clash: { id: 3, time: 500 } }))
})
