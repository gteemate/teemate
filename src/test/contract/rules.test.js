// Same rules on both sides (see rules.js): the pretend server keeps each rule, and each names a database test that
// proves the real database keeps it too.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { makeWorld } from '../journeys/fake-api.js'
import { TODAY } from '../journeys/driver.js'
import { RULES } from './rules.js'

const sqlText = file => readFileSync(`${process.cwd()}/supabase/tests/${file}`, 'utf8')

describe.each(RULES.map(r => [r.id, r]))('%s', (_, r) => {
  it(`the database test “${r.sql[1]}” exists`, () => {
    expect(sqlText(r.sql[0])).toContain(`t.ok('${r.sql[1].replace(/'/g, "''")}'`)
  })
  it(`the pretend server keeps it: ${r.says}`, async () => {
    const { api, db } = makeWorld(TODAY, r.setup ?? (() => {}), r.who)
    if (r.refused) {
      await expect(Promise.resolve().then(() => r.act(api, db))).rejects.toThrow(r.refused)
    } else {
      const out = await r.act(api, db)
      expect(out.ok(db)).toBe(true)
    }
  })
})
