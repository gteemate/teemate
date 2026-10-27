// npm run testing:pdf — runs every app test and the database tests (on the test database), then writes
// docs/testing/TeeMate-testing.html and docs/testing/TeeMate-testing.pdf: each feature with the testing carried out
// and the results, the tests across the whole app, and the pre-demo checklist.
import { execSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { buildReport, parseDbOutput } from './testing-report.js'
import { FEATURES, AREAS, GENERIC } from '../src/test/features.js'
import { JOURNEYS } from '../src/test/journeys/catalogue.js'
import { RULES } from '../src/test/contract/rules.js'
import { FOUND_FIXED } from '../src/test/found-fixed.js'

const root = process.cwd(), out = `${root}/docs/testing`, tmp = `${root}/.superpowers/testing-results.json`
mkdirSync(out, { recursive: true }); mkdirSync(`${root}/.superpowers`, { recursive: true })

console.log('Running the app tests…')
spawnSync('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${tmp}`], { stdio: 'ignore' })
const vitest = JSON.parse(readFileSync(tmp, 'utf8')); rmSync(tmp)
console.log('Running the database tests (test database)…')
const dbRun = spawnSync('node', ['scripts/db.mjs', 'test'], { encoding: 'utf8' })
const db = parseDbOutput(`${dbRun.stdout}\n${dbRun.stderr}`)

// The last real-browser run (npm run test:screens), if there's been one on this computer.
let screens = null
const dir = `${root}/test-results/screens`
if (existsSync(dir)) {
  const files = readdirSync(dir).filter(f => /^results-.*\.json$/.test(f))
  if (files.length) {
    const rows = files.flatMap(f => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')))
    const when = new Date(Math.max(...files.map(f => statSync(`${dir}/${f}`).mtimeMs))).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    const hard = rows.filter(r => r.sideways || r.offEdge?.length || r.tooSmall?.length || r.covered?.length || r.squeezed?.length).length
    screens = { when, summary: `${rows.length} screen checks at ${files.length} sizes, ${hard ? `${hard} with a problem` : 'no problems'}${rows.some(r => r.skipped) ? `, ${rows.filter(r => r.skipped).length} not reached` : ''}` }
  }
}

const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const html = buildReport({ vitest, db, dbRan: dbRun.status === 0 && db.length > 0, root, features: FEATURES, areas: AREAS, generic: GENERIC, foundFixed: FOUND_FIXED, date, journeys: JOURNEYS.length, rules: RULES.length, screens })
writeFileSync(`${out}/TeeMate-testing.html`, html)
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'load' })
await page.pdf({ path: `${out}/TeeMate-testing.pdf`, format: 'A4', printBackground: true, displayHeaderFooter: true,
  headerTemplate: '<span></span>', footerTemplate: `<div style="font:8px Arial;color:#5b6475;width:100%;text-align:center">TeeMate testing · ${date} · page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
  margin: { top: '14mm', bottom: '16mm', left: '15mm', right: '15mm' } })
await browser.close()
const failed = vitest.numFailedTests + db.filter(d => !d.ok).length
console.log(`Wrote docs/testing/TeeMate-testing.pdf (${vitest.numPassedTests} app tests passed, ${db.filter(d => d.ok).length} database checks passed${failed ? `, ${failed} failed` : ''})`)
