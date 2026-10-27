// The feature register can't claim a test that isn't there, or fall behind the journeys.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { FEATURES, AREAS, GENERIC } from './features.js'
import { JOURNEYS } from './journeys/catalogue.js'
import { RULES } from './contract/rules.js'

const root = process.cwd()
const text = path => readFileSync(`${root}/${path}`, 'utf8')

/** Why a test reference doesn't point at a real test, or null. */
export function missing(ref) {
  if (ref.startsWith('journey:')) return JOURNEYS.some(j => j.id === ref.slice(8)) ? null : 'no such journey'
  if (ref.startsWith('rule:')) return RULES.some(r => r.id === ref.slice(5)) ? null : 'no such rule'
  const [path, name] = ref.split(' › ')
  if (!existsSync(`${root}/${path}`)) return 'no such file'
  if (name == null) return null
  if (path.endsWith('.sql')) return text(path).includes(`t.ok('${name.replace(/'/g, "''")}`) ? null : 'no such database check'
  return text(path).includes(name) ? null : 'no such test'
}

describe('the feature register', () => {
  it('every feature has an area, words and at least one scenario', () => {
    for (const f of FEATURES) {
      expect(AREAS, f.id).toContain(f.area)
      expect(f.what.length, f.id).toBeGreaterThan(20)
      expect(f.scenarios.length, f.id).toBeGreaterThan(0)
    }
  })
  it('every scenario names at least one test, and every test named is real', () => {
    const bad = FEATURES.flatMap(f => f.scenarios.flatMap(s => (s.tests.length ? s.tests : ['(none)']).map(t => [f.id, s.says, t, s.tests.length ? missing(t) : 'no tests']))).filter(x => x[3])
    expect(bad).toEqual([])
  })
  it('every journey belongs to a feature', () => {
    const named = new Set(FEATURES.flatMap(f => f.scenarios.flatMap(s => s.tests)).filter(t => t.startsWith('journey:')).map(t => t.slice(8)))
    expect(JOURNEYS.map(j => j.id).filter(id => !named.has(id))).toEqual([])
  })
  it('every same-rules check belongs to a feature', () => {
    const named = new Set(FEATURES.flatMap(f => f.scenarios.flatMap(s => s.tests)).filter(t => t.startsWith('rule:')).map(t => t.slice(5)))
    expect(RULES.map(r => r.id).filter(id => !named.has(id))).toEqual([])
  })
  it('every generic test named is real', () => {
    const bad = GENERIC.flatMap(g => g.tests.map(t => [g.name, t, missing(t)])).filter(x => x[2])
    expect(bad).toEqual([])
  })
})
