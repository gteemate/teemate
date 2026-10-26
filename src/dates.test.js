import { describe, it, expect } from 'vitest'
import { weeklyDates } from './dates.js'

describe('weekly repeats', () => {
  it('the same day each week up to and including the last date', () => {
    expect(weeklyDates('2026-12-06', '2027-01-10')).toEqual(['2026-12-06', '2026-12-13', '2026-12-20', '2026-12-27', '2027-01-03', '2027-01-10'])
    expect(weeklyDates('2026-12-06', '2027-01-09')).toHaveLength(5)
    expect(weeklyDates('2026-12-06', '2026-12-06')).toEqual(['2026-12-06'])
    expect(weeklyDates('2026-12-06', '2026-12-01')).toEqual([])
  })
})
