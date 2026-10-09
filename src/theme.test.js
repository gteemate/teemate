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
  it('the default club colours give the navy palette exactly', () => {
    const v = themeVars({ main: '#19335A', accent: '#762A43' })
    expect([v['--sunk'], v['--bg'], v['--surface'], v['--leaf'], v['--line']]).toEqual(['#0f1830', '#141f3b', '#1b2a4b', '#22325a', '#2b3c63'])
    expect(v['--ring']).toBe('#762A43') // the disc ring is the accent colour
  })
  it('any main colour makes backgrounds as dark as the navy ones, so light text always reads', () => {
    for (const main of ['#9fd3c7', '#F2D21B', '#0B6E4F', '#000000', '#ffffff']) {
      const v = themeVars({ main, accent: '#C9A227' })
      const nav = themeVars({ main: '#19335A', accent: '#762A43' })
      for (const k of ['--sunk', '--bg', '--surface', '--leaf', '--line']) expect(Math.abs(luminance(v[k]) - luminance(nav[k]))).toBeLessThan(0.004)
      expect(textOn(v['--bg'])).toBe('#f4f6fb')
    }
  })
  it('keeps the club\'s hue: a green club gets green-tinted backgrounds', () => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(themeVars({ main: '#0B6E4F', accent: '#C9A227' })['--bg'].slice(i, i + 2), 16))
    expect(g).toBeGreaterThan(r)
    expect(g).toBeGreaterThan(b)
  })
  it('pin flags: the accent at the front; the back flag a lighter main so it shows on dark backgrounds', () => {
    const v = themeVars({ main: '#0B6E4F', accent: '#C9A227' })
    expect(v['--flag-front']).toBe('#C9A227')
    expect(luminance(v['--flag-back'])).toBeGreaterThan(0.15)
  })
  it('only accepts 6-digit hex', () => {
    expect([isHex('#19335A'), isHex('19335A'), isHex('#1935A'), isHex('green')]).toEqual([true, false, false, false])
  })
})
