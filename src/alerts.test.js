import { describe, it, expect } from 'vitest'
import { pickAlerts } from './alerts.js'
import { eventFormatName } from './games.js'

const DATE = '2026-10-09'
const me = { id: 1, name: 'Gareth Cochrane' }
// A match: my group (slot 10, 08:10) and Peter's group (slot 20, 07:50), Peter's group proposed it.
const pe = (over = {}) => ({
  id: 5, date: DATE, status: 'pending', format: 'best2', proposerSlot: 20, proposedBy: { id: 2, name: 'Peter Reid' },
  players: [{ memberId: 1, slot: 10 }, { memberId: 2, slot: 20 }],
  groups: [{ slot: 20, time: 470, host: true, answer: null }, { slot: 10, time: 490, host: false, answer: null }],
  ...over,
})
const req = (over = {}) => ({ id: 3, date: '2026-11-14', time: 490, status: 'approved', note: null, decidedAt: '2026-10-08T10:00:00Z', seen: false, ...over })
const base = { me, playerEvents: [], requests: [], date: DATE, now: Date.parse('2026-10-09T12:00:00Z'), hidden: new Set() }
const ids = a => a.actions.map(x => x.id)

describe('pickAlerts: what drops down from the header', () => {
  it('nothing waiting: none', () => expect(pickAlerts(base)).toEqual([]))

  it("another four-ball's challenge for my group: Accept, Decline, See details, Later", () => {
    const [a] = pickAlerts({ ...base, playerEvents: [pe()] })
    expect(a).toMatchObject({ key: 'pe:5', kind: 'challenge', title: "Peter Reid's four-ball (07:50) has challenged your group", detail: eventFormatName('best2'), ref: { peId: 5 } })
    expect(ids(a)).toEqual(['accept', 'decline', 'details', 'later'])
    expect(a.actions[0].primary).toBe(true)
  })
  it('no alert when my group has answered, my group proposed it, it was called off, or it is tomorrow', () => {
    const answered = pe({ groups: [{ slot: 20, time: 470, host: true, answer: null }, { slot: 10, time: 490, host: false, answer: 'accepted' }] })
    const events = [answered, pe({ id: 6, proposerSlot: 10 }), pe({ id: 7, status: 'cancelled' }), pe({ id: 8, date: '2026-10-10' })]
    expect(pickAlerts({ ...base, playerEvents: events })).toEqual([])
  })

  it('a request approved: OK or Later', () => {
    const [a] = pickAlerts({ ...base, requests: [req()] })
    expect(a).toMatchObject({ key: 'rq:3', kind: 'request', title: 'Request approved: Sat 14 Nov 08:10', detail: 'Booked. It’s in your bookings.', ref: { reqId: 3 } })
    expect(ids(a)).toEqual(['ok', 'later'])
  })
  it("a request declined: the admin's note, or No reason given", () => {
    expect(pickAlerts({ ...base, requests: [req({ status: 'declined', note: 'Full, try 08:30' })] })[0]).toMatchObject({ title: 'Request declined: Sat 14 Nov 08:10', detail: 'Full, try 08:30' })
    expect(pickAlerts({ ...base, requests: [req({ status: 'declined' })] })[0].detail).toBe('No reason given')
  })
  it('no alert for a request already seen, still waiting, or answered 8 days ago', () => {
    expect(pickAlerts({ ...base, requests: [req({ seen: true }), req({ id: 4, status: 'pending', decidedAt: null }), req({ id: 5, decidedAt: '2026-10-01T10:00:00Z' })] })).toEqual([])
  })
  it('two answered requests: two alerts, oldest answer first', () => {
    const a = pickAlerts({ ...base, requests: [req({ id: 4, decidedAt: '2026-10-08T12:00:00Z' }), req()] })
    expect(a.map(x => x.key)).toEqual(['rq:3', 'rq:4'])
  })
  it('challenges come before requests', () => {
    expect(pickAlerts({ ...base, requests: [req()], playerEvents: [pe()] }).map(x => x.kind)).toEqual(['challenge', 'request'])
  })
  it('Later hides only that one', () => {
    expect(pickAlerts({ ...base, requests: [req()], playerEvents: [pe()], hidden: new Set(['pe:5']) }).map(x => x.key)).toEqual(['rq:3'])
  })
})

import { alertCheckDue } from './alerts.js'
describe('alertCheckDue: when to look for new alerts', () => {
  const t = 1_000_000
  it('first time: yes', () => expect(alertCheckDue(null, 'home', 0, t)).toBe(true))
  it('a different screen: yes', () => expect(alertCheckDue('home', 'scores/card', t, t + 1000)).toBe(true))
  it('the same screen redrawn (a score tapped): no', () => expect(alertCheckDue('scores/card', 'scores/card', t, t + 1000)).toBe(false))
  it('the same screen, but over a minute since the last look: yes', () => expect(alertCheckDue('scores/card', 'scores/card', t, t + 61e3)).toBe(true))
})
