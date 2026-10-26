import { describe, it, expect } from 'vitest'
import { penceText, orderTotal, menuSections, hutPromptDue, nextStatuses } from './hut.js'

const menu = [
  { id: 1, section: 'Drinks', name: 'Tea', pricePence: 250, soldOut: false, sort: 1 },
  { id: 2, section: 'Food', name: 'Bacon roll', pricePence: 450, soldOut: false, sort: 2 },
  { id: 3, section: 'Food', name: 'Sausage roll', pricePence: 400, soldOut: true, sort: 1 },
  { id: 4, section: 'Snacks', name: 'Mars bar', pricePence: 120, soldOut: false, sort: 1 },
]

describe('penceText', () => {
  it('pounds and pence', () => { expect(penceText(450)).toBe('£4.50'); expect(penceText(0)).toBe('£0.00'); expect(penceText(1205)).toBe('£12.05') })
})

describe('orderTotal', () => {
  it('price × count, items not on the menu ignored', () => expect(orderTotal(menu, { 1: 2, 2: 1, 99: 3 })).toBe(950))
  it('nothing picked: 0', () => expect(orderTotal(menu, {})).toBe(0))
})

describe('menuSections', () => {
  it('Food, Drinks, Snacks; sold out left out; by sort', () =>
    expect(menuSections(menu).map(s => [s.section, s.items.map(i => i.id)])).toEqual([['Food', [2]], ['Drinks', [1]], ['Snacks', [4]]]))
  it('a section with nothing left goes', () =>
    expect(menuSections(menu.filter(i => i.section !== 'Drinks')).map(s => s.section)).toEqual(['Food', 'Snacks']))
})

describe('hutPromptDue: ask after hole 8, once per card', () => {
  const done = n => Array.from({ length: 18 }, (_, i) => i < n)
  const card = { id: 7, done: done(8), game: 'stab', submitted: {} }
  const base = { on: true, card, asked: [], orders: [] }
  it('hole 8 saved, hut on: ask', () => expect(hutPromptDue(base)).toBe(true))
  it('hole 8 not saved yet: no', () => expect(hutPromptDue({ ...base, card: { ...card, done: done(7) } })).toBe(false))
  it('hut switched off: no', () => expect(hutPromptDue({ ...base, on: false })).toBe(false))
  it('asked already on this card: no', () => expect(hutPromptDue({ ...base, asked: [7] })).toBe(false))
  it('already ordered on this card: no', () => expect(hutPromptDue({ ...base, orders: [{ roundId: 7, status: 'sent' }] })).toBe(false))
  it('an order on this card that was cancelled: still ask', () => expect(hutPromptDue({ ...base, orders: [{ roundId: 7, status: 'cancelled' }] })).toBe(true))
  it('round finished, no card, or a card not saved yet: no', () => {
    expect(hutPromptDue({ ...base, card: { ...card, submitted: { stab: true } } })).toBe(false)
    expect(hutPromptDue({ ...base, card: null })).toBe(false)
    expect(hutPromptDue({ ...base, card: { ...card, id: null } })).toBe(false)
  })
})

describe('nextStatuses', () => {
  it('sent → ready or cancelled; ready → collected or cancelled; then nothing', () => {
    expect(nextStatuses('sent')).toEqual(['ready', 'cancelled'])
    expect(nextStatuses('ready')).toEqual(['collected', 'cancelled'])
    expect(nextStatuses('collected')).toEqual([])
    expect(nextStatuses('cancelled')).toEqual([])
  })
})

import { orderable } from './hut.js'
describe('orderable: only hot food is ordered ahead (it takes time); drinks and snacks are bought at the hut', () => {
  it('Food yes, Drinks and Snacks no', () => expect(menu.map(i => [i.name, orderable(i)])).toEqual([['Tea', false], ['Bacon roll', true], ['Sausage roll', true], ['Mars bar', false]]))
})

describe('found in review: the hut asks on an event’s open holes', () => {
  const card = done => ({ id: 9, game: 'stab', done, submitted: {} })
  const at = n => Array.from({ length: 18 }, (_, i) => i < n)
  const q = (done, holes) => hutPromptDue({ on: true, card: card(done), asked: [], orders: [], holes })
  it('holes 1–6 and 10–12: asked once hole 6 is saved', () => {
    expect(q(at(5), [1, 2, 3, 4, 5, 6, 10, 11, 12])).toBe(false)
    expect(q(at(6), [1, 2, 3, 4, 5, 6, 10, 11, 12])).toBe(true)
  })
  it('all 18 as before: hole 8', () => { expect(q(at(7), null)).toBe(false); expect(q(at(8), null)).toBe(true) })
  it('the back 9 only: never at the turn', () => expect(q(Array.from({ length: 18 }, (_, i) => i >= 9), [10, 11, 12, 13, 14, 15, 16, 17, 18])).toBe(false))
})
