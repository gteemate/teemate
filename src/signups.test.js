import { describe, it, expect } from 'vitest'
import { canEnter, myEntries, partnerChoices, needsSection } from './signups.js'

const D = '2026-10-11'
const comp = (o = {}) => ({ id: 1, name: 'Men’s Fourball', category: 'men', kind: 'pairs', closesOn: '2026-10-31', open: true, ...o })
const man = { id: 1, playsIn: 'men' }, lady = { id: 2, playsIn: 'ladies' }, unset = { id: 3, playsIn: null }

describe('canEnter: what Competitions → Events shows', () => {
  it("men's to men, ladies' to ladies; mixed to either; open to anyone", () => {
    const comps = [comp({ id: 1 }), comp({ id: 2, category: 'ladies' }), comp({ id: 3, category: 'mixed' }), comp({ id: 4, category: 'open' })]
    expect(canEnter({ comps, entries: [], me: man, date: D }).map(c => c.id)).toEqual([1, 3, 4])
    expect(canEnter({ comps, entries: [], me: lady, date: D }).map(c => c.id)).toEqual([2, 3, 4])
    expect(canEnter({ comps, entries: [], me: unset, date: D }).map(c => c.id)).toEqual([4])
  })
  it("not once I'm entered (myself or as someone's partner), closed, not open, or no closing date", () => {
    const comps = [comp({ id: 1 }), comp({ id: 2 }), comp({ id: 3, closesOn: '2026-10-10' }), comp({ id: 4, open: false }), comp({ id: 5, closesOn: null })]
    const entries = [{ compId: 1, memberId: 1, partnerId: null }, { compId: 2, memberId: 9, partnerId: 1 }]
    expect(canEnter({ comps, entries, me: man, date: D })).toEqual([])
  })
  it('closing today: still open', () => expect(canEnter({ comps: [comp({ closesOn: D })], entries: [], me: man, date: D })).toHaveLength(1))
})

describe('myEntries: what Entered shows', () => {
  it('mine and the ones I am a partner in, with who I play with', () => {
    const comps = [comp({ id: 1 }), comp({ id: 2 }), comp({ id: 3 })]
    const entries = [{ compId: 1, memberId: 1, partnerId: 5 }, { compId: 2, memberId: 7, partnerId: 1 }, { compId: 3, memberId: 8, partnerId: 9 }]
    expect(myEntries({ comps, entries, me: man }).map(x => [x.comp.id, x.partnerId])).toEqual([[1, 5], [2, 7]])
  })
})

describe('partnerChoices: who I can enter a pair with', () => {
  const members = [man, lady, unset, { id: 4, playsIn: 'men' }, { id: 5, playsIn: 'men' }, { id: 6, playsIn: 'ladies' }]
  it("men's pairs: other men not already entered", () =>
    expect(partnerChoices(comp(), man, members, [{ compId: 1, memberId: 5, partnerId: null }]).map(m => m.id)).toEqual([4]))
  it('mixed pairs: the other section', () => expect(partnerChoices(comp({ category: 'mixed' }), man, members, []).map(m => m.id)).toEqual([2, 6]))
  it('open pairs: anyone else', () => expect(partnerChoices(comp({ category: 'open' }), man, members, []).map(m => m.id)).toEqual([2, 3, 4, 5, 6]))
})

describe('needsSection: ask me to set Men’s or Ladies’', () => {
  it('when an open competition needs it and I have not set it', () => {
    expect(needsSection([comp()], unset, D)).toBe(true)
    expect(needsSection([comp()], man, D)).toBe(false)
    expect(needsSection([comp({ category: 'open' })], unset, D)).toBe(false)
  })
})
