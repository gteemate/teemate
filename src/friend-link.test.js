import { describe, it, expect } from 'vitest'
import { friendLink, readFriendLink, addFriendAction } from './friend-link.js'

const BASE = 'https://gteemate.github.io/teemate/'
const on = new Date(2026, 9, 10)
const me = { id: 7, name: 'Ciarán O\'Neill', hcp: -2.1, gui: '4536292' }
const hashOf = link => link.slice(link.indexOf('#'))

describe('friendLink / readFriendLink', () => {
  it('round trip, odd characters and a plus handicap intact', () => {
    const link = friendLink(me, 'Smith & Sons GC', BASE, on)
    expect(link.startsWith(BASE + '#friend?')).toBe(true)
    expect(readFriendLink(hashOf(link))).toEqual({ name: 'Ciarán O\'Neill', club: 'Smith & Sons GC', hcp: '+2.1', gui: '4536292', memberId: 7, sharedOn: '2026-10-10' })
  })
  it('no club name or GUI: left out, read back as null', () => {
    const c = readFriendLink(hashOf(friendLink({ ...me, gui: null }, '', BASE, on)))
    expect(c).toMatchObject({ club: null, gui: null })
    expect(hashOf(friendLink({ ...me, gui: null }, '', BASE, on))).not.toMatch(/[&?](c|g)=/)
  })
  it('broken links: null', () => {
    expect(readFriendLink('#friend?n=A')).toBeNull()
    expect(readFriendLink('#friend?n=A&m=x')).toBeNull()
    expect(readFriendLink('#friend?m=3')).toBeNull()
    expect(readFriendLink('#other?n=A&m=3')).toBeNull()
    expect(readFriendLink('#friend?n=' + 'a'.repeat(600) + '&m=3')).toBeNull()
  })
})

describe('addFriendAction: what the Add friend page offers', () => {
  const card = { name: 'Peter  reid', club: 'Royal Teemate', hcp: '8.1', gui: '111', memberId: 2, sharedOn: '2026-10-10' }
  const members = [{ id: 2, name: 'Peter Reid' }, { id: 7, name: 'Gareth Cochrane' }]
  const ctx = (o = {}) => ({ me: { id: 7 }, members, buddies: [], contacts: [], ...o })
  it('signed out: sign in to save', () => expect(addFriendAction(card, ctx({ me: null })).kind).toBe('signin'))
  it('my own card', () => expect(addFriendAction({ ...card, memberId: 7 }, ctx()).kind).toBe('self'))
  it('a member of my club (name matches, case and spaces aside): add', () => expect(addFriendAction(card, ctx())).toEqual({ kind: 'add', memberId: 2 }))
  it('already a club friend', () => expect(addFriendAction(card, ctx({ buddies: [2] })).kind).toBe('already'))
  it("a member number here, but someone else's name (another club's TeeMate): a contact", () =>
    expect(addFriendAction({ ...card, name: 'Pat Other' }, ctx()).kind).toBe('save'))
  it('another club, not saved yet: save', () => expect(addFriendAction({ ...card, memberId: 99, name: 'Sam Visitor' }, ctx()).kind).toBe('save'))
  const other = { ...card, memberId: 99, name: 'Sam Visitor', gui: '555', hcp: '12.0' }
  it('saved before (same GUI), handicap changed: update', () => {
    const c = { id: 4, name: 'Sam Visitor', gui: '555', hcp: '13.2', club: 'Royal Teemate' }
    expect(addFriendAction(other, ctx({ contacts: [c] }))).toEqual({ kind: 'update', contact: c })
  })
  it('saved before, nothing changed: same', () => {
    const c = { id: 4, name: 'Sam Visitor', gui: '555', hcp: '12.0', club: 'Royal Teemate' }
    expect(addFriendAction(other, ctx({ contacts: [c] })).kind).toBe('same')
  })
  it('no GUI: matched by name (the first one)', () => {
    const a = { id: 4, name: 'sam visitor', gui: null, hcp: '20', club: null }, b = { id: 5, name: 'Sam Visitor', gui: null, hcp: '21', club: null }
    expect(addFriendAction({ ...other, gui: null }, ctx({ contacts: [a, b] }))).toEqual({ kind: 'update', contact: a })
  })
})

import { pickerGroups } from './friend-link.js'
describe('pickerGroups: who to offer when adding players to a booking', () => {
  const members = [{ id: 1, name: 'Ann Able' }, { id: 2, name: 'Bob Best' }, { id: 3, name: 'Cal Cole' }, { id: 4, name: 'Dee Dunn' }]
  const friends = {
    buddies: [{ id: 1, favourite: true }, { id: 2, favourite: false }, { id: 3, favourite: false }],
    contacts: [{ id: 9, name: 'Sam Visitor', favourite: true }, { id: 8, name: 'Jo Away', favourite: false }],
  }
  const base = { members, friends, taken: new Set(), guestNames: new Set(), q: '', canGuest: true }
  const shape = gs => gs.map(g => [g.title, g.rows.map(r => (r.kind === 'member' ? r.m.id : `c${r.c.id}`))])
  it('favourites (club and other clubs), then your friends, then friends from other clubs', () =>
    expect(shape(pickerGroups(base))).toEqual([['Favourites', [1, 'c9']], ['Your friends', [2, 3]], ['Friends from other clubs', ['c8']]]))
  it('people already in the booking are left out, and empty groups go', () =>
    expect(shape(pickerGroups({ ...base, taken: new Set([1]), guestNames: new Set(['sam visitor']) }))).toEqual([['Your friends', [2, 3]], ['Friends from other clubs', ['c8']]]))
  it('not enough guest points: other-club friends are greyed out', () => {
    const rows = pickerGroups({ ...base, canGuest: false }).flatMap(g => g.rows).filter(r => r.kind === 'contact')
    expect(rows.every(r => r.disabled)).toBe(true)
  })
  it('searching: all members who match, then matching friends from other clubs', () =>
    expect(shape(pickerGroups({ ...base, q: 'a' }))).toEqual([['Members', [1, 3]], ['Friends from other clubs', ['c9', 'c8']]]))
  it('no friends and no search: nothing', () => expect(pickerGroups({ ...base, friends: { buddies: [], contacts: [] } })).toEqual([]))
})
