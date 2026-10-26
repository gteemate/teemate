// The journey list: every customer journey, by who does it, with every way the server can say no to it.
//   { id, who, title, setup?(db), steps, action, expect(db, app) → truthy, refusals, unreachable?, browser? }
//   steps:      [{ tap: words or CSS } | { type: [CSS, value] } | { pick: [CSS, value] } | { back: true }] — the last one
//               sends `action` (a function in src/api) to the server
//   refusals:   'all' (every message the action's database functions can give, from refusal-index.json) |
//               [messages] | { none: 'why it can't be refused' }
//   unreachable: { [message]: 'why the app never meets it' } — taken out of 'all'
//   browser:    steps that also work on the test database, for the real-browser run
import member from './catalogue/member.js'

export const PEOPLE = ['member', 'organiser', 'captain', 'office', 'hut', 'newjoiner', 'visitor']
export const JOURNEYS = [...member]
