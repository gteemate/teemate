import { describe, it, expect } from 'vitest'
import { money, feeLine, feeTotal } from './fees.js'

describe('money', () => {
  it('whole pounds plainly, pence to two places', () => expect([500, 3750, 1205, 0].map(money)).toEqual(['£5', '£37.50', '£12.05', '£0']))
})

describe('feeLine: what a member sees when they enter', () => {
  it('no fee: nothing', () => { expect(feeLine(null, 'purse')).toBeNull(); expect(feeLine(0, 'shop')).toBeNull() })
  it('paid in the pro shop', () => expect(feeLine(500, 'shop')).toBe('Entry £5, paid in the pro shop'))
  it('from the purse, before balances are linked', () => expect(feeLine(500, 'purse')).toBe('Entry £5, taken from your competition purse'))
  it('from the purse, with the balance: what is left after', () => expect(feeLine(500, 'purse', 4250)).toBe('Entry £5 · £37.50 left in your competition purse after this'))
  it('not enough in the purse: says so', () => expect(feeLine(500, 'purse', 300)).toBe('Entry £5. Your competition purse has £3: top it up before entries close'))
})

describe('feeTotal: the office’s view', () => {
  it('entries and fees taken', () => { expect(feeTotal(500, 12)).toBe('12 entries · £60 in fees'); expect(feeTotal(null, 1)).toBe('1 entry') })
})
