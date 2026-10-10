// The click report: runs every member journey and lists how many taps each takes (typing isn't counted), how many
// screens it passes through, and how many presses of back it takes to get Home from where it ends (every journey
// checks Home can be reached).   npm run report:taps
import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const out = join(tmpdir(), `teemate-taps-${process.pid}.json`)
const r = spawnSync('npx', ['vitest', 'run', 'src/test/journeys/journeys.test.js', 'src/test/journeys/games.test.js', 'src/test/journeys/features.test.js'],
  { env: { ...process.env, TAP_REPORT: out }, stdio: ['ignore', 'ignore', 'inherit'] })
const rows = ['', '-games', '-features'].map(s => out.replace(/\.json$/, `${s}.json`)).filter(existsSync).flatMap(f => JSON.parse(readFileSync(f, 'utf8')))
console.log('Taps  Screens  Back to Home  Journey')
for (const x of rows) console.log(`${String(x.taps).padStart(4)}  ${String(x.screens).padStart(7)}  ${String(x.back ?? '–').padStart(12)}  ${x.ok ? '' : '✗ FAILED  '}${x.journey}`)
process.exit(r.status ?? 1)
