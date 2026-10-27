import { describe, it, expect } from 'vitest'
import { holeList, openCourse, scaleHcp, cardGross, holesText, holesCount, holesFor, allOpen } from './open-holes.js'
import { shotsOnHole } from './scoring.js'
import { COURSE } from './sample-data.js'

const ODD = [1, 2, 3, 4, 5, 6, 10, 11, 12]
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

describe('open holes', () => {
  it('reads every stored form of the holes', () => {
    expect(holeList(null)).toEqual(range(1, 18))
    expect(holeList(12)).toEqual(range(1, 12)) // match days saved before: holes 1 to n
    expect(holeList([12, 1, 3, 3])).toEqual([1, 3, 12])
    expect(allOpen(null)).toBe(true)
    expect(allOpen(range(1, 18))).toBe(true)
    expect(allOpen(ODD)).toBe(false)
  })
  it('the open holes of the course: course index kept, stroke index ranked among them', () => {
    const h = openCourse(COURSE.holes, ODD)
    expect(h.length).toBe(9)
    expect(h.map(x => x.i)).toEqual([0, 1, 2, 3, 4, 5, 9, 10, 11])
    expect(h.map(x => x.n ?? x.i + 1)).toEqual(ODD)
    expect(h.map(x => x.si)).toEqual([3, 6, 2, 8, 4, 9, 5, 7, 1]) // course SIs 6,10,4,16,8,18,9,15,3
    expect(h.every(x => x.of === 9)).toBe(true)
    expect(openCourse(COURSE.holes, null).map(x => x.si)).toEqual(COURSE.holes.map(x => x.si))
  })
  it('handicaps scaled to the holes played', () => {
    expect(scaleHcp(18, 6)).toBe(6)
    expect(scaleHcp(13, 9)).toBe(7)
    expect(scaleHcp(-3, 6)).toBe(-1)
    expect(scaleHcp(10, 18)).toBe(10)
  })
  it('shots over fewer holes', () => {
    expect(shotsOnHole(6, 1, 6)).toBe(1)
    expect(shotsOnHole(7, 1, 6)).toBe(2)
    expect(shotsOnHole(-1, 6, 6)).toBe(-1)
    expect(shotsOnHole(-1, 5, 6)).toBe(0)
    expect(shotsOnHole(20, 2)).toBe(2)
  })
  it('gross scores from the card at the open holes only', () => {
    const card = { scores: COURSE.holes.map((_, i) => [i + 1, 50 + i]), done: COURSE.holes.map((_, i) => i !== 10) }
    expect(cardGross(card, 1, openCourse(COURSE.holes, [1, 10, 11]))).toEqual([50, 59, null])
  })
  it('describes the holes', () => {
    expect(holesText(null)).toBe('')
    expect(holesText(ODD)).toBe('Holes 1–6, 10–12')
    expect(holesText([5])).toBe('Hole 5')
    expect(holesText([1, 3])).toBe('Holes 1, 3')
    expect(holesCount(ODD)).toBe('9 holes open: 1–6, 10–12')
    expect(holesCount(null)).toBe('All 18 holes open')
    expect(holesCount([])).toBe('No holes open')
  })
  it('a day’s own holes, else the event’s', () => {
    const e = { holes: [1, 2], dayRules: { 2: { holes: [3] } } }
    expect(holesFor(e, 2)).toEqual([3])
    expect(holesFor(e, 1)).toEqual([1, 2])
    expect(holesFor({}, 1)).toBe(null)
  })
})

import { savedHoles } from './open-holes.js'
describe('found in review: today’s scores count every saved hole', () => {
  it('holes saved out of order or with gaps all count, with their course index', () => {
    const card = { scores: COURSE.holes.map((_, i) => [i + 1]), done: COURSE.holes.map((_, i) => i < 6 || (i >= 9 && i <= 11)) }
    expect(savedHoles(card, 0)).toEqual({ holes: [0, 1, 2, 3, 4, 5, 9, 10, 11], gross: [1, 2, 3, 4, 5, 6, 10, 11, 12] })
    expect(savedHoles({ ...card, done: COURSE.holes.map((_, i) => i >= 9) }, 0).holes).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17])
  })
})
