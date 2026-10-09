import { describe, it, expect } from 'vitest'
import { shareText } from './share-card.js'

const me = { name: 'James Smith', hcp: 14.5, gui: '4536292' }

const LINK = 'https://gteemate.github.io/teemate/#friend?n=James+Smith&m=4'
describe('shareText: the message a member shares (the QR holds the link)', () => {
  it('name, club, handicap index, then the link', () => expect(shareText(me, 'Royal Portrush GC', LINK)).toBe(
    `James Smith · Royal Portrush GC · Handicap index 14.5\nAdd me as a friend on TeeMate: ${LINK}`))
  it('no club name set: left out', () => expect(shareText(me, '', LINK).split('\n')[0]).toBe('James Smith · Handicap index 14.5'))
  it('a plus handicap is written as +2.4', () => expect(shareText({ ...me, hcp: -2.4 }, 'X', LINK)).toContain('Handicap index +2.4'))
  it('nothing else: no email or phone even if the member has them', () => {
    const t = shareText({ ...me, email: 'j@example.com', phone: '07700 900000' }, 'X', LINK)
    expect(t).not.toMatch(/@|07700/)
  })
})
