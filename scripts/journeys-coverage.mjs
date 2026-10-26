// npm run journeys:coverage — what the journey list (src/test/journeys/catalogue.js) doesn't cover yet.
import { readFileSync } from 'node:fs'
import { gaps } from '../src/test/journeys/coverage.js'
import { JOURNEYS, PEOPLE, ALSO_UNREACHABLE } from '../src/test/journeys/catalogue.js'

const index = JSON.parse(readFileSync(new URL('../src/test/journeys/refusal-index.json', import.meta.url), 'utf8'))
const g = gaps(JOURNEYS, index, PEOPLE, ALSO_UNREACHABLE)
const nMsg = Object.values(g.messages).reduce((s, m) => s + m.length, 0)
console.log(`${JOURNEYS.length} journeys · missing: ${g.actions.length} actions, ${nMsg} refusals, ${g.people.length} people`)
if (g.people.length) console.log(`\nPeople with no journeys: ${g.people.join(', ')}`)
if (g.actions.length) console.log(`\nActions with no journey:\n  ${g.actions.join('\n  ')}`)
for (const [f, ms] of Object.entries(g.messages)) console.log(`\n${f}:\n  ${ms.join('\n  ')}`)
