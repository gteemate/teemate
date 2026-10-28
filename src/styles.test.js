// Style clashes found in review: a class reused by two screens with different jobs. Read straight from styles.css.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].trim(), body: m[2] }))
// rules styling the element itself (the class in the selector's last part, not an ancestor's)
const uses = cls => rules.filter(r => r.sel.split(',').some(s => new RegExp(`\\.${cls}(?![\\w-])`).test(s.trim().split(/[\s>+~]+/).at(-1))))

describe('styles', () => {
  it('found 27 Oct: Scoring round?’s tick rows (.tick) are never given a small fixed width (Find a time’s grid boxes are .fttick)', () => {
    const fixed = uses('tick').filter(r => /(^|;)\s*width\s*:\s*\d+px/.test(r.body))
    expect(fixed.map(r => r.sel)).toEqual([])
    expect(uses('fttick').length).toBeGreaterThan(0)
  })
})
