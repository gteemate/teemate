import { describe, it, expect } from 'vitest'
import { guestCounts } from './guest-counts.js'

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
