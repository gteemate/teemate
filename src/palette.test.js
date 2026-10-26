import { describe, it, expect } from 'vitest'
import { PALETTE, visible } from './palette.js'

const lum = hex => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const contrast = (x, y) => { const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p); return (a + 0.05) / (b + 0.05) }
const hexes = PALETTE.map(p => p.hex)

describe('team colours you can see on navy', () => {
  it('ten colours, each clearly visible on the app’s background and cards', () => {
    expect(PALETTE).toHaveLength(10)
    for (const { name, hex } of PALETTE) for (const bg of ['#141f3b', '#1b2a4b']) expect(contrast(hex, bg), `${name} on ${bg}`).toBeGreaterThanOrEqual(3)
  })
  it('a palette colour stays as it is (any case)', () => {
    for (const h of hexes) { expect(visible(h)).toBe(h); expect(visible(h.toLowerCase())).toBe(h) }
  })
  it('the old navy and maroon defaults become Sky and Red', () => {
    expect(visible('#19335a')).toBe('#6CB6FF')
    expect(visible('#762A43')).toBe('#E5484D')
  })
  it('any other colour becomes the palette colour nearest in hue; greys become Silver', () => {
    expect(visible('#0B3D20')).toBe('#46C37B') // dark green → Green
    expect(visible('#4a2a7a')).toBe('#B79CFF') // purple → Lilac
    expect(visible('#333333')).toBe('#C9CED6')
  })
  it('nothing usable: Sky', () => {
    expect(visible(null)).toBe('#6CB6FF')
    expect(visible('blue')).toBe('#6CB6FF')
  })
})

import { visiblePair } from './palette.js'
describe('found in review: two teams never share a colour', () => {
  it('two blues become two different colours', () => {
    const [a, b] = visiblePair('#19335a', '#2a4a8a')
    expect(a).toBe('#6CB6FF')
    expect(b).not.toBe(a)
  })
  it('two different colours stay as they are', () => {
    expect(visiblePair('#E5484D', '#6CB6FF')).toEqual(['#E5484D', '#6CB6FF'])
  })
})
