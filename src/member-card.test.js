import { describe, it, expect } from 'vitest'
import { memberFromCard, personFromScan } from './member-card.js'
import { friendLink } from './friend-link.js'

const members = [{ id: 3, name: "Ciarán O'Neill" }, { id: 5, name: 'Pat Reid' }]
const card = (m, base = 'https://gteemate.github.io/teemate/') => friendLink({ ...m, hcp: 12.4 }, 'Royal TeeMate', base)

describe('reading a member card (the QR on the Account card)', () => {
  it('a real card → that member', () => {
    expect(memberFromCard(card(members[1]), members)).toEqual({ id: 5, name: 'Pat Reid', cardName: 'Pat Reid' })
  })
  it('a card made on another copy of the app (another address) still reads', () => {
    expect(memberFromCard(card(members[0], 'http://localhost:5173/'), members)?.id).toBe(3)
  })
  it('the number matches but the name doesn’t → not a card', () => {
    expect(memberFromCard(card({ id: 5, name: 'Someone Else' }), members)).toBeNull()
  })
  it('a member number nobody has → not a card', () => {
    expect(memberFromCard(card({ id: 99, name: 'Pat Reid' }), members)).toBeNull()
  })
  it('any other QR code → not a card', () => {
    expect(memberFromCard('https://example.com', members)).toBeNull()
    expect(memberFromCard('', members)).toBeNull()
    expect(memberFromCard(null, members)).toBeNull()
    expect(memberFromCard('x'.repeat(10000), members)).toBeNull()
  })
})

describe('who a scanned code is (adding playing partners)', () => {
  it('one of our members → { member }', () => {
    expect(personFromScan(card(members[1]), members)).toEqual({ member: { id: 5, name: 'Pat Reid', cardName: 'Pat Reid' } })
  })
  it('someone from another club (their card isn’t one of ours) → { card } with their details', () => {
    const p = personFromScan(friendLink({ id: 44, name: 'Alex Moore', hcp: 9.1, gui: '10855555' }, 'Portrush', 'https://x.example/'), members)
    expect(p.card).toMatchObject({ name: 'Alex Moore', club: 'Portrush', hcp: '9.1', gui: '10855555' })
    expect(p.member).toBeUndefined()
  })
  it('any other QR code → null', () => expect(personFromScan('https://example.com', members)).toBeNull())
})
