import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildIndex } from '../../../scripts/refusal-index.mjs'
import { messagePattern } from './patterns.js'

const saved = JSON.parse(readFileSync(new URL('./refusal-index.json', import.meta.url), 'utf8'))

describe('the refusal index', () => {
  it('is up to date (run npm run journeys:index after changing the database or src/api)', () => {
    expect(saved).toEqual(buildIndex())
  })
  it('knows which database function an app action calls', () => {
    expect(saved.api.enterSignup.rpc).toEqual(['enter_signup'])
  })
  it('knows each database function’s refusals', () => {
    expect(saved.db.enter_signup).toContain('% is already entered in %. Pick another partner.')
  })
  it('every database function an action calls is known', () => {
    for (const [fn, { rpc }] of Object.entries(saved.api)) for (const r of rpc) expect(saved.db, `${fn} → ${r}`).toHaveProperty(r)
  })
})

describe('message patterns', () => {
  it('a % stands for any words', () => {
    expect('Jacqueline Cochrane is already entered in Mixed Fourball. Pick another partner.').toMatch(messagePattern('% is already entered in %. Pick another partner.'))
    expect('Sorry, X is full (3 places).').toMatch(messagePattern('Sorry, % is full (% places).'))
  })
})
