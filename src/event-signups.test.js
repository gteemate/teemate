import { describe, it, expect } from 'vitest'
import { signupOpen, closesOn, spacesLeft, spacesText, signupLine } from './event-signups.js'

const e = (o = {}) => ({ club: true, signup: true, startDate: '2026-12-01', advertiseFrom: '2026-11-01', entriesClose: '2026-11-25', maxEntries: 4, players: [1, 2], ...o })

describe('events open for sign-up', () => {
  it('open from the advertise date to the closing date, inclusive', () => {
    expect(signupOpen(e(), '2026-10-31')).toBe(false)
    expect(signupOpen(e(), '2026-11-01')).toBe(true)
    expect(signupOpen(e(), '2026-11-25')).toBe(true)
    expect(signupOpen(e(), '2026-11-26')).toBe(false)
    expect(signupOpen(e({ signup: false }), '2026-11-10')).toBe(false)
    expect(signupOpen(e({ advertiseFrom: null }), '2026-10-01')).toBe(true)
  })
  it('with no closing date, entries close the day before the first day', () => {
    expect(closesOn(e({ entriesClose: null }))).toBe('2026-11-30')
    expect(signupOpen(e({ entriesClose: null }), '2026-11-30')).toBe(true)
    expect(signupOpen(e({ entriesClose: null }), '2026-12-01')).toBe(false)
  })
  it('places left, and the counter’s words', () => {
    expect(spacesLeft(e())).toBe(2)
    expect(spacesLeft(e({ players: [1, 2, 3, 4, 5] }))).toBe(0) // the office added one over the limit
    expect(spacesLeft(e({ maxEntries: null }))).toBe(null)
    expect(spacesText(10)).toBe('10 spaces remaining')
    expect(spacesText(1)).toBe('1 space remaining')
  })
  it('the office’s line under the set-up', () => {
    expect(signupLine(e())).toBe('Members see it from Sun 1 Nov · entries close Wed 25 Nov · 4 places')
    expect(signupLine(e({ advertiseFrom: null, entriesClose: null, maxEntries: null }))).toBe('Members see it straight away · entries close Mon 30 Nov · no limit')
  })
})
