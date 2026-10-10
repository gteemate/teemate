// The click report: runs the member journeys and lists how many taps each takes (typing isn't counted) and how
// many screens it passes through.   npm run report:taps
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const out = join(tmpdir(), `teemate-taps-${process.pid}.json`)
const r = spawnSync('npx', ['vitest', 'run', 'src/test/journeys/journeys.test.js'], { env: { ...process.env, TAP_REPORT: out }, stdio: ['ignore', 'ignore', 'inherit'] })
const rows = JSON.parse(readFileSync(out, 'utf8'))
console.log('Taps  Screens  Journey')
for (const x of rows) console.log(`${String(x.taps).padStart(4)}  ${String(x.screens).padStart(7)}  ${x.ok ? '' : '✗ FAILED  '}${x.journey}`)
process.exit(r.status ?? 1)
