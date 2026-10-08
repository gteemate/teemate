import { describe, it, expect } from 'vitest'
import { mix, textOn, themeVars, luminance, isHex } from './theme.js'

describe('club colours', () => {
  it('mixes colours', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mix('#19335a', '#ffffff', 0)).toBe('#19335a')
  })
  it('picks readable text for the colour behind it', () => {
    expect(textOn('#19335A')).toBe('#f4f6fb') // navy → light text
    expect(textOn('#F2D21B')).toBe('#151a26') // yellow → dark text
    expect(textOn('#FFFFFF')).toBe('#151a26')
  })
  it('derives light and dark shades from two colours', () => {
    const { light, dark } = themeVars({ main: '#0B6E4F', accent: '#C9A227' })
    expect(light['--green']).toBe('#0B6E4F')
    expect(light['--loss']).toBe('#C9A227')
    expect(luminance(light['--leaf'])).toBeGreaterThan(0.7) // pale tint for selected cards
    expect(luminance(dark['--leaf-line'])).toBeGreaterThan(luminance(dark['--leaf'])) // outline stands out in dark mode
    expect(light['--on-loss']).toBe('#151a26') // gold accent gets dark text
  })
  it('pin flags are the exact club colours in both modes: accent at the front, main at the back', () => {
    const { light, dark } = themeVars({ main: '#0B6E4F', accent: '#C9A227' })
    for (const m of [light, dark]) expect([m['--flag-front'], m['--flag-back']]).toEqual(['#C9A227', '#0B6E4F'])
  })
  it('only accepts 6-digit hex', () => {
    expect([isHex('#19335A'), isHex('19335A'), isHex('#1935A'), isHex('green')]).toEqual([true, false, false, false])
  })
})
