import { describe, it, expect } from 'vitest'
import { shareText } from './share-card.js'

const me = { name: 'James Smith', hcp: 14.5, gui: '4536292' }
const on = new Date(2026, 9, 9)

describe('shareText: the handicap details a member shares (and the QR holds)', () => {
  it('name, club, handicap index, GUI and when', () => expect(shareText(me, 'Royal Portrush GC', on)).toBe(
    'James Smith\nRoyal Portrush GC\nHandicap index 14.5\nGUI 4536292\n(shared from TeeMate, 9 Oct 2026)'))
  it('no GUI yet', () => expect(shareText({ ...me, gui: null }, 'Royal Portrush GC', on)).toContain('\nGUI not added\n'))
  it('no club name set: that line is left out', () => expect(shareText(me, '', on).split('\n')).toEqual(['James Smith', 'Handicap index 14.5', 'GUI 4536292', '(shared from TeeMate, 9 Oct 2026)']))
  it('a plus handicap is written as +2.4', () => expect(shareText({ ...me, hcp: -2.4 }, 'X', on)).toContain('Handicap index +2.4'))
  it('nothing else: no email or phone even if the member has them', () => {
    const t = shareText({ ...me, email: 'j@example.com', phone: '07700 900000' }, 'X', on)
    expect(t).not.toMatch(/@|07700/)
  })
})
