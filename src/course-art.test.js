import { describe, it, expect } from 'vitest'
import { pinFrom, pinDistances, flagOf } from './course-art.js'

const green = { greenDepth: 31, greenWidth: 25 }

describe('pin positions', () => {
  it('"3 yds from the back and 1 from the right" (the admin’s way of saying it)', () => {
    const pin = pinFrom(green, 'back', 3, 'right', 1)
    expect(pin).toEqual({ yardsOn: 28, fromLeft: 24, depthRef: 'back', sideRef: 'right' })
    expect(pinDistances(green, pin)).toEqual({ front: 28, back: 3, left: 24, right: 1 })
    expect(flagOf(pin.yardsOn, green.greenDepth)).toBe('back')
  })
  it('front and left measure straight through', () => {
    const pin = pinFrom(green, 'front', 8, 'left', 6)
    expect(pinDistances(green, pin)).toEqual({ front: 8, back: 23, left: 6, right: 19 })
    expect(flagOf(pin.yardsOn, green.greenDepth)).toBe('front')
  })
  it('switching which edge you measure from keeps the same pin', () => {
    const a = pinFrom(green, 'back', 3, 'right', 1)
    const d = pinDistances(green, a)
    const b = pinFrom(green, 'front', d.front, 'left', d.left)
    expect([b.yardsOn, b.fromLeft]).toEqual([a.yardsOn, a.fromLeft])
  })
})
