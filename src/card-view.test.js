import { describe, it, expect } from 'vitest'
import { viewPerm, toView, toStored, mergeSaved } from './card-view.js'
import { PAIRINGS } from './games.js'

// Gareth (319) started the card: Gareth, Tom (10), Orla (12), Peter (293).
const card = {
  lineup: [{ m: 319 }, { m: 10 }, { m: 12 }, { m: 293 }],
  scores: [[4, 5, 6, 7], [3, 4, 5, 6]],
  done: [true, false],
  pairing: 0, // Gareth & Tom v Orla & Peter
  submitted: {},
}
const teams = (lineup, p) => {
  const o = PAIRINGS[p]
  return [[o[0], o[1]], [o[2], o[3]]].map(side => side.map(i => lineup[i].m).sort((a, b) => a - b))
}

describe('shared card views', () => {
  it('the starter sees the card as stored', () => {
    expect(viewPerm(card.lineup, 319)).toEqual([0, 1, 2, 3])
    const v = toView(card, 319)
    expect(v.lineup).toEqual(card.lineup)
    expect(v.scores).toEqual(card.scores)
  })

  it('another player sees themselves first, with their own scores', () => {
    const v = toView(card, 293)
    expect(v.lineup.map(e => e.m)).toEqual([293, 319, 10, 12])
    expect(v.scores[0]).toEqual([7, 4, 5, 6])
  })

  it('keeps the same teams, with me on side A', () => {
    for (let p = 0; p < 3; p++) {
      const v = toView({ ...card, pairing: p }, 293)
      const want = teams(card.lineup, p).sort(), got = teams(v.lineup, v.pairing).sort()
      expect(got).toEqual(want)
      expect(PAIRINGS[v.pairing][0]).toBe(0)
    }
  })

  it('stores back exactly what was loaded', () => {
    for (const me of [319, 10, 12, 293]) for (let p = 0; p < 3; p++) {
      const c = { ...card, pairing: p }
      expect(toStored(toView(c, me))).toEqual(c)
    }
  })

  it('a score and a pairs change made in my view land on the right players', () => {
    const v = toView(card, 12) // Orla: [12, 319, 10, 293]
    v.scores[1][0] = 9 // Orla's hole 2
    v.pairing = 1 // Orla & Tom v Gareth & Peter
    const s = toStored(v)
    expect(s.scores[1]).toEqual([3, 4, 9, 6])
    expect(teams(s.lineup, s.pairing).sort()).toEqual([[10, 12], [293, 319]])
  })

  it('works for 2 and 3 ball cards', () => {
    const c3 = { lineup: [{ m: 1 }, { m: 2 }, { m: 3 }], scores: [[4, 5, 6]], done: [false], pairing: 0, submitted: {} }
    const v = toView(c3, 3)
    expect(v.lineup.map(e => e.m)).toEqual([3, 1, 2])
    expect(v.scores[0]).toEqual([6, 4, 5])
    expect(toStored(v)).toEqual(c3)
  })

  it('a card I started fresh has no perm and is stored as it is', () => {
    expect(toStored(card)).toEqual(card)
  })
})

describe('merging saved holes', () => {
  // Hole 1 on Gareth's card: Gareth (319), Tom (10), Orla (12), Peter (293). Par 4.
  const blank = () => [[4, 4, 4, 4]]
  const nobody = () => [[null, null, null, null]]
  const at = (scores, entered, done = [true]) => ({ ...card, scores, entered, done, submitted: {} })

  it("Peter's own bogey survives Gareth saving the hole with Peter left on par", () => {
    const theirs = at([[4, 4, 4, 5]], [[null, null, null, 293]]) // Peter saved his 5
    const mine = at([[3, 4, 4, 4]], [[319, null, null, null]]) // Gareth typed his own 3, left Peter alone
    const m = mergeSaved(mine, theirs, new Set(['0:0']))
    expect(m.scores[0]).toEqual([3, 4, 4, 5])
    expect(m.entered[0]).toEqual([319, null, null, 293])
  })

  it("Gareth's untouched par never overwrites, even if he saves later", () => {
    const theirs = at([[4, 4, 4, 5]], [[null, null, null, 293]])
    const m = mergeSaved(at(blank(), nobody()), theirs, new Set())
    expect(m.scores[0]).toEqual([4, 4, 4, 5])
  })

  it("a score typed for Peter by Gareth can't replace the one Peter typed himself", () => {
    const theirs = at([[4, 4, 4, 5]], [[null, null, null, 293]])
    const mine = at([[4, 4, 4, 6]], [[null, null, null, 319]])
    expect(mergeSaved(mine, theirs, new Set(['0:3'])).scores[0][3]).toBe(5)
  })

  it('but Peter correcting his own score replaces what Gareth typed for him', () => {
    const theirs = at([[4, 4, 4, 6]], [[null, null, null, 319]])
    const mine = at([[4, 4, 4, 5]], [[null, null, null, 293]])
    expect(mergeSaved(mine, theirs, new Set(['0:3'])).scores[0][3]).toBe(5)
  })

  it('a typed score beats an untouched one, and the latest of two typed-for-someone scores wins', () => {
    const theirs = at([[4, 4, 4, 4]], [[null, 12, null, null]]) // Orla typed Tom's 4
    const mine = at([[4, 5, 4, 4]], [[null, 319, null, null]]) // then Gareth typed Tom's 5
    expect(mergeSaved(mine, theirs, new Set(['0:1'])).scores[0][1]).toBe(5)
  })

  it('cards from before anyone was tracked (no entered) still merge', () => {
    const theirs = { ...card, scores: [[4, 5, 6, 7], [4, 4, 4, 4], [6, 6, 6, 6]], done: [true, true, true], submitted: { stab: true } }
    const mine = { ...card, scores: [[4, 5, 6, 7], [3, 3, 3, 3], [5, 5, 5, 5]], done: [true, true, false] }
    const m = mergeSaved(mine, theirs, new Set(['1:0', '1:1', '1:2', '1:3']))
    expect(m.scores).toEqual([[4, 5, 6, 7], [3, 3, 3, 3], [6, 6, 6, 6]])
    expect(m.done).toEqual([true, true, true])
    expect(m.submitted).toEqual({ stab: true })
  })

  it('who typed what follows each player into my view and back', () => {
    const c = { ...card, entered: [[319, null, 12, 293], [null, null, null, null]] }
    const v = toView(c, 293)
    expect(v.entered[0]).toEqual([293, 319, null, 12])
    expect(toStored(v)).toEqual(c)
  })
})
