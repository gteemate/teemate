import { describe, it, expect } from 'vitest'
import { guestCounts, likelySame, GUEST_VISITS } from './guest-counts.js'

describe('a member’s guests, counted', () => {
  it('the same guest (any case or spacing) counts up; most often first, then most recent', () => {
    const v = [
      { guest: 'Sam Guest', club: 'Portrush', points: 3, date: '2026-05-01' },
      { guest: 'Alex Moore', club: '', points: 3, date: '2026-09-01' },
      { guest: 'sam  guest', club: 'Portrush', points: 3, date: '2026-08-01' },
      { guest: 'Jo Banks', club: '', points: 3, date: '2026-04-01' },
    ]
    expect(guestCounts(v)).toEqual([
      { guest: 'Sam Guest', club: 'Portrush', times: 2, points: 6, last: '2026-08-01' },
      { guest: 'Alex Moore', club: '', times: 1, points: 3, last: '2026-09-01' },
      { guest: 'Jo Banks', club: '', times: 1, points: 3, last: '2026-04-01' },
    ])
  })
  it('none: an empty list', () => expect(guestCounts([])).toEqual([]))
})

describe('guests who may be the same person (a guest can come 6 times a year)', () => {
  const g = (guest, times) => ({ guest, club: '', times, points: times * 3, last: '2026-10-01' })
  it('the limit is 6 a year', () => expect(GUEST_VISITS).toBe(6))
  it('same surname, and an initial or the same first letter: G Cochrane, Gary and Gareth together', () => {
    const r = likelySame([g('Gary Cochrane', 3), g('G Cochrane', 2), g('Gareth Cochrane', 1), g('Paul Hugh', 1)])
    expect(r).toEqual([{ names: ['Gary Cochrane', 'G Cochrane', 'Gareth Cochrane'], times: 6 }])
  })
  it('a different first letter, or a different surname, isn’t flagged (Steve and Jon Thompson)', () => {
    expect(likelySame([g('Steve Thompson', 1), g('Jon Thompson', 1), g('Steve Thomas', 1)])).toEqual([])
  })
  it('“G. Cochrane” and accents or case don’t matter', () => {
    expect(likelySame([g('G. Cochrane', 1), g('gary cochrane', 2)])).toEqual([{ names: ['G. Cochrane', 'gary cochrane'], times: 3 }])
    expect(likelySame([g('Seán Ó Briain', 1), g('S O Briain', 1)])).toEqual([{ names: ['Seán Ó Briain', 'S O Briain'], times: 2 }])
  })
  it('a pair the office said are different people isn’t flagged again', () => {
    expect(likelySame([g('Gary Cochrane', 3), g('G Cochrane', 2)], [{ a: 'g cochrane', b: 'gary cochrane' }])).toEqual([])
  })
  it('a single name isn’t compared', () => expect(likelySame([g('Gary', 1), g('G', 1)])).toEqual([]))
})
