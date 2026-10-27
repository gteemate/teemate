// The journey list: every customer journey, by who does it, with every way the server can say no to it.
//   { id, who, title, setup?(db), steps, action, expect(db, app) → truthy, refusals, unreachable?, browser? }
//   steps:      [{ tap: words or CSS } | { type: [CSS, value] } | { pick: [CSS, value] } | { back: true }] — the last one
//               sends `action` (a function in src/api) to the server
//   refusals:   'all' (every message the action's database functions can give, from refusal-index.json) |
//               [messages] | { none: 'why it can't be refused' }
//   unreachable: { [message]: 'why the app never meets it' } — taken out of 'all'
//   keeps:      { [db key]: why } — what may change even when the action is refused (left out of 'nothing half-saved')
//   hash:       start from a link (e.g. a shared friend card)
//   browser:    steps that also work on the test database, for the real-browser run
//   prepare:    async (app) after the app starts, before the steps (e.g. stand in for the camera)
import member from './catalogue/member.js'
import office from './catalogue/office.js'

export const PEOPLE = ['member', 'organiser', 'captain', 'office', 'hut', 'newjoiner', 'visitor']
export const JOURNEYS = [...member, ...office]
// Messages no journey can meet, with why (guards for things the app never offers that person, input the screens prevent).
export const ALSO_UNREACHABLE = {}
// Data functions no screen calls, with why (kept for the database or a later feature).
export const NOT_OFFERED = {
  leaveEventRound: 'no screen takes a player out of a counted event round (the card is deleted or the event changed instead)',
  undeclineSignup: 'no screen undoes No thanks: entering the competition does it',
}
