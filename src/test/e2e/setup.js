// Before the end-to-end tests: the test database reset to the scenarios, with test sign-ins for Gary (admin) and
// Declan. After: the scenarios again, linked back to the owner's own sign-in. Never touches the live database
// (scripts/db.mjs refuses).
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { E2E, e2eSetup, scenarios, target } from '../../../scripts/db.mjs'

export async function setup({ provide }) {
  if (target !== 'test') throw new Error('End-to-end tests only run against the test database.')
  const password = `e2e-${randomBytes(9).toString('base64url')}`
  await e2eSetup(password)
  provide('e2e', { ...E2E, password })
}

export async function teardown() {
  const made = spawnSync(process.execPath, ['scripts/make-seed.mjs'], { encoding: 'utf8' })
  if (made.status !== 0) throw new Error(made.stderr)
  await scenarios()
}
