import { describe, it, expect } from 'vitest'
import { resolveRef, buildReport, parseDbOutput } from './testing-report.js'

const root = '/repo'
const vitest = { testResults: [
  { name: `${root}/src/test/journeys/refusals.test.js`, assertionResults: [
    { ancestorTitles: ['book-tee-time'], title: 'Book a tee time with a friend (as member)', status: 'passed' },
    { ancestorTitles: ['book-tee-time'], title: 'refused: “That tee time is full.” is seen, not stuck, nothing half-saved', status: 'passed' },
    { ancestorTitles: ['cancel-booking'], title: 'Delete my booking (as member)', status: 'failed' },
  ] },
  { name: `${root}/src/release.test.js`, assertionResults: [{ ancestorTitles: ['opens'], title: 'Sat opens Fri 8pm', status: 'passed' }, { ancestorTitles: ['opens'], title: 'Sun too', status: 'passed' }] },
  { name: `${root}/src/test/contract/rules.test.js`, assertionResults: [{ ancestorTitles: ['request-reason'], title: 'the pretend server keeps it: x', status: 'passed' }] },
] }
const db = parseDbOutput('release.sql\n  ✓ Before release: refused\n  ✗ Rules: 0 days ahead refused  →  null\n\nAll database tests passed\n')

describe('reading the results', () => {
  it('the database output: each check with its file and whether it passed', () => {
    expect(db).toEqual([{ file: 'release.sql', name: 'Before release: refused', ok: true }, { file: 'release.sql', name: 'Rules: 0 days ahead refused', ok: false }])
  })
  it('a journey counts its own test and every refusal check', () => {
    expect(resolveRef('journey:book-tee-time', { vitest, db, root })).toEqual({ passed: 2, failed: 0, failures: [] })
  })
  it('a whole file, one test by title, a rule, and a database check', () => {
    expect(resolveRef('src/release.test.js', { vitest, db, root })).toMatchObject({ passed: 2, failed: 0 })
    expect(resolveRef('src/release.test.js › Sun too', { vitest, db, root })).toMatchObject({ passed: 1, failed: 0 })
    expect(resolveRef('rule:request-reason', { vitest, db, root })).toMatchObject({ passed: 1 })
    expect(resolveRef('supabase/tests/release.sql › Rules: 0 days ahead refused', { vitest, db, root })).toMatchObject({ passed: 0, failed: 1 })
  })
  it('a test that didn’t run is not counted as passed', () => {
    expect(resolveRef('src/nothing.test.js › Missing', { vitest, db, root })).toEqual({ passed: 0, failed: 0, failures: [], notRun: true })
  })
})

describe('the report', () => {
  const features = [{ id: 'book', area: 'Booking', name: 'Book a tee time', what: 'Members book.', scenarios: [{ says: 'Book with a friend', tests: ['journey:book-tee-time'] }, { says: 'Delete', tests: ['journey:cancel-booking'] }],
    demo: [{ who: 'live@test.com', steps: ['Booking → + Add a booking'], see: 'It’s booked.' }] }]
  const html = buildReport({ vitest, db, root, features, areas: ['Booking'], generic: [], foundFixed: [{ date: '2026-10-27', what: 'A thing', test: 'a test' }], date: '27 October 2026', journeys: 2, rules: 1, screens: null })
  it('shows each scenario with its counts', () => {
    expect(html).toContain('Book with a friend')
    expect(html).toMatch(/2 passed/)
  })
  it('a failure is listed in a red box at the top, by name', () => {
    expect(html).toContain('class="failbox"')
    expect(html).toContain('Delete my booking (as member)')
  })
  it('the checklist is grouped by demo login', () => {
    expect(html).toContain('live@test.com')
    expect(html).toContain('Booking → + Add a booking')
  })
  it('lists what the testing found and fixed', () => {
    expect(html).toContain('A thing')
  })
  it('found in review: a test file that failed to load is a failure, not “Everything passed”', () => {
    const broken = { testResults: [...vitest.testResults.slice(1), { name: `${root}/src/broken.test.js`, status: 'failed', message: 'SyntaxError: oops', assertionResults: [] }] }
    const h = buildReport({ vitest: broken, db, root, features: [], areas: [], generic: [], foundFixed: [], date: 'x', journeys: 0, rules: 0, screens: null })
    expect(h).toContain('class="failbox"')
    expect(h).toContain('src/broken.test.js')
    expect(h).not.toContain('Everything passed')
  })
  it('found in review: database tests that didn’t run are a failure', () => {
    const h = buildReport({ vitest: { testResults: [] }, db: [], dbRan: false, root, features: [], areas: [], generic: [], foundFixed: [], date: 'x', journeys: 0, rules: 0, screens: null })
    expect(h).toContain('The database tests didn’t run')
    expect(h).not.toContain('Everything passed')
  })
})

describe('found in review: names match exactly', () => {
  it('a test whose name only starts the same, or that was skipped, isn’t counted as passing', () => {
    const v = { testResults: [{ name: `${root}/src/a.test.js`, assertionResults: [{ ancestorTitles: [], title: 'Sun too far', status: 'passed' }, { ancestorTitles: [], title: 'Skipped one', status: 'skipped' }] }] }
    expect(resolveRef('src/a.test.js › Sun too', { vitest: v, db: [], root })).toMatchObject({ notRun: true })
    expect(resolveRef('src/a.test.js › Skipped one', { vitest: v, db: [], root })).toMatchObject({ notRun: true })
  })
})

