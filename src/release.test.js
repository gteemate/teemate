import { describe, it, expect } from 'vitest'
import { opensAt, openLabel, countdown, timeLabel } from './release.js'

const rules = (over = {}) => ({ time: '20:00', days: 8, weekendsOnly: false, ...over })

describe('opensAt: when a day\'s tee times open (UK time, as the database works it out)', () => {
  it('Sat 31 Oct opens Fri 23 Oct at 8pm summer time (19:00 UTC)', () => expect(opensAt('2026-10-31', rules()).toISOString()).toBe('2026-10-23T19:00:00.000Z'))
  it('Sat 7 Nov opens Fri 30 Oct at 8pm winter time (20:00 UTC)', () => expect(opensAt('2026-11-07', rules()).toISOString()).toBe('2026-10-30T20:00:00.000Z'))
  it('weekends only: a Wednesday is always open', () => expect(opensAt('2026-10-28', rules({ weekendsOnly: true }))).toBeNull())
  it('weekends only: a Sunday still has a release', () => expect(opensAt('2026-11-01', rules({ weekendsOnly: true })).toISOString()).toBe('2026-10-24T19:00:00.000Z'))
  it('a half-past release time and a different number of days', () => expect(opensAt('2026-12-12', rules({ time: '19:30', days: 7 })).toISOString()).toBe('2026-12-05T19:30:00.000Z'))
})

describe('labels', () => {
  it('8pm, 8.30pm, 12am, 12pm, 7am', () => expect(['20:00', '20:30', '00:00', '12:00', '07:00'].map(timeLabel)).toEqual(['8pm', '8.30pm', '12am', '12pm', '7am']))
  it('openLabel: "Opens Friday 23 October at 8pm"', () => expect(openLabel('2026-10-31', rules())).toBe('Opens Friday 23 October at 8pm'))
  it('openLabel with a half-past time', () => expect(openLabel('2026-12-12', rules({ time: '19:30', days: 7 }))).toBe('Opens Saturday 5 December at 7.30pm'))
})

describe('countdown', () => {
  const s = 1000, m = 60 * s, h = 60 * m
  it('hours and minutes', () => expect(countdown(2 * h + 14 * m + 30 * s)).toBe('Opens in 2h 14m'))
  it('minutes and seconds', () => expect(countdown(3 * m + 5 * s)).toBe('Opens in 3m 05s'))
  it('seconds', () => expect(countdown(45 * s)).toBe('Opens in 45s'))
  it('part seconds round up (never shows 0s while still closed)', () => expect(countdown(300)).toBe('Opens in 1s'))
  it('time\'s up', () => expect(countdown(0)).toBe('Opening…'))
})
