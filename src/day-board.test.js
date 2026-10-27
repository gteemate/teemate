import { describe, it, expect } from 'vitest'
import { dayBoardOn } from './day-board.js'

describe('is the leaderboard of the day on?', () => {
  const sat = '2026-10-31', wed = '2026-10-28'
  it('every day when nothing is set', () => {
    expect(dayBoardOn({}, sat)).toBe(true)
  })
  it('only on the ticked days of the week (0 Sunday … 6 Saturday)', () => {
    const theme = { dayBoardDays: [0, 1, 2, 3, 4, 5] } // off on Saturdays
    expect(dayBoardOn(theme, sat)).toBe(false)
    expect(dayBoardOn(theme, wed)).toBe(true)
  })
  it('today’s switch wins for that day only', () => {
    const theme = { dayBoardDays: [0, 1, 2, 3, 4, 5], dayBoardToday: { date: sat, on: true } }
    expect(dayBoardOn(theme, sat)).toBe(true)
    expect(dayBoardOn({ ...theme, dayBoardToday: { date: wed, on: false } }, wed)).toBe(false)
    expect(dayBoardOn({ ...theme, dayBoardToday: { date: '2026-10-30', on: true } }, sat)).toBe(false) // yesterday's switch is over
  })
})
