import { describe, it, expect } from 'vitest'
import { startTab, needsMyAnswer } from './home-today.js'

const me = { id: 1, name: 'Gareth Cochrane' }
const card = (over = {}) => ({ game: 'stab', done: Array(18).fill(false), submitted: {}, ...over })

// A player event: my group (slot 10, 08:10) and Peter's group (slot 20, 07:50).
const pe = (over = {}) => ({
  id: 5, date: '2026-10-09', status: 'pending', format: 'best2', proposerSlot: 20, proposedBy: { id: 2, name: 'Peter Reid' },
  players: [{ memberId: 1, slot: 10 }, { memberId: 2, slot: 20 }],
  groups: [{ slot: 20, time: 470, host: true, answer: null }, { slot: 10, time: 490, host: false, answer: null }],
  ...over,
})

describe('startTab: which tab the app opens on', () => {
  it('no card today: Home', () => expect(startTab(null)).toBe('home'))
  it('a card with nothing saved yet: Home', () => expect(startTab(card())).toBe('home'))
  it('a card with a hole saved: Scores', () => expect(startTab(card({ done: [true, ...Array(17).fill(false)] }))).toBe('scores'))
  it('a finished card: Home', () => expect(startTab(card({ done: Array(18).fill(true), submitted: { stab: true } }))).toBe('home'))
})

describe('needsMyAnswer: a match invitation my group still has to answer', () => {
  it('not answered yet: yes', () => expect(needsMyAnswer(pe(), me)).toBe(true))
  it('my group has answered: no', () => expect(needsMyAnswer(pe({ groups: [{ slot: 20, time: 470, host: true, answer: null }, { slot: 10, time: 490, host: false, answer: 'accepted' }] }), me)).toBe(false))
  it('my own group proposed it: no', () => expect(needsMyAnswer(pe({ proposerSlot: 10 }), me)).toBe(false))
  it('no proposerSlot: the host group proposed it', () => expect(needsMyAnswer(pe({ proposerSlot: null, groups: [{ slot: 10, time: 490, host: true, answer: null }, { slot: 20, time: 470, host: false, answer: null }] }), me)).toBe(false))
  it('called off: no', () => expect(needsMyAnswer(pe({ status: 'cancelled' }), me)).toBe(false))
})
