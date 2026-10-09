import { describe, it, expect } from 'vitest'
import { startTab, todayItems } from './home-today.js'

const TODAY = '2026-10-09', TOMORROW = '2026-10-10'
const me = { id: 1, name: 'Gareth Cochrane' }
const none = { me, card: null, teeTimes: [], playerEvents: [], events: [], date: TODAY }
const card = (over = {}) => ({ game: 'stab', done: Array(18).fill(false), submitted: {}, ...over })

// A player event: my group (slot 10, 08:10) and Peter's group (slot 20, 07:50).
const pe = (over = {}) => ({
  id: 5, date: TODAY, status: 'pending', format: 'best2', proposerSlot: 20, proposedBy: { id: 2, name: 'Peter Reid' },
  players: [{ memberId: 1, slot: 10 }, { memberId: 2, slot: 20 }],
  groups: [{ slot: 20, time: 470, host: true, answer: null }, { slot: 10, time: 490, host: false, answer: null }],
  ...over,
})
const league = (over = {}) => ({ id: 9, name: 'Winter League', style: 'league', club: true, startDate: '2026-10-05', weeks: 10, players: [1, 3], ...over })
const kinds = items => items.map(x => x.kind)

describe('startTab: which tab the app opens on', () => {
  it('no card today: Home', () => expect(startTab(null)).toBe('home'))
  it('a card with nothing saved yet: Home', () => expect(startTab(card())).toBe('home'))
  it('a card with a hole saved: Scores', () => expect(startTab(card({ done: [true, ...Array(17).fill(false)] }))).toBe('scores'))
  it('a finished card: Home', () => expect(startTab(card({ done: Array(18).fill(true), submitted: { stab: true } }))).toBe('home'))
})

describe('todayItems: what goes on Today', () => {
  it('nothing on: an empty list', () => expect(todayItems(none)).toEqual([]))

  it('an invitation to my group, not answered yet: an Answer row that opens Scores', () => {
    const [x] = todayItems({ ...none, playerEvents: [pe()] })
    expect(x).toMatchObject({ kind: 'invite', title: 'Invitation from Peter Reid', pill: { text: 'Answer', gold: true }, go: { tab: 'scores' } })
    expect(x.detail).toBe('07:50 v 08:10')
  })
  it('my group has already answered: no row', () => {
    const e = pe({ groups: [{ slot: 20, time: 470, host: true, answer: null }, { slot: 10, time: 490, host: false, answer: 'accepted' }] })
    expect(todayItems({ ...none, playerEvents: [e] })).toEqual([])
  })
  it('my own group proposed it: no row (only invited groups answer)', () => {
    expect(todayItems({ ...none, playerEvents: [pe({ proposerSlot: 10 })] })).toEqual([])
  })
  it('no proposerSlot: the host group proposed it (as on the Scores tab)', () => {
    const e = pe({ proposerSlot: null, groups: [{ slot: 10, time: 490, host: true, answer: null }, { slot: 20, time: 470, host: false, answer: null }] })
    expect(todayItems({ ...none, playerEvents: [e] })).toEqual([])
  })
  it('a called-off match: no row', () => expect(todayItems({ ...none, playerEvents: [pe({ status: 'cancelled' })] })).toEqual([]))
  it('an invitation for tomorrow: no row', () => expect(todayItems({ ...none, playerEvents: [pe({ date: TOMORROW })] })).toEqual([]))

  it('a card and a tee time: just the card', () => {
    const items = todayItems({ ...none, card: card({ done: [true, true, false] }), teeTimes: [{ id: 10, time: 490, players: [] }] })
    expect(kinds(items)).toEqual(['card'])
    expect(items[0]).toMatchObject({ title: 'Individual Stableford', pill: { text: 'On the go' }, detail: '2 holes played', go: { tab: 'scores' } })
  })
  it('a card not started yet', () => expect(todayItems({ ...none, card: card() })[0].detail).toBe('not started'))
  it('a finished card', () => expect(todayItems({ ...none, card: card({ submitted: { stab: true } }) })[0].pill).toEqual({ text: 'Finished' }))
  it('a card with a game the app doesn\'t know: called Scorecard', () => expect(todayItems({ ...none, card: card({ game: 'zzz' }) })[0].title).toBe('Scorecard'))

  it('a tee time and no card: the tee time, with who else is on it', () => {
    const t = { id: 10, time: 490, players: [{ memberId: 1, name: 'Gareth Cochrane' }, { memberId: 2, name: 'Peter Reid' }, { memberId: null, name: 'Sam Guest' }] }
    expect(todayItems({ ...none, teeTimes: [t] })).toEqual([{ kind: 'tee', title: 'Tee time 08:10', pill: null, detail: 'Peter Reid, Sam Guest', go: { tab: 'scores' } }])
  })
  it('a tee time on my own', () => expect(todayItems({ ...none, teeTimes: [{ id: 10, time: 490, players: [{ memberId: 1, name: 'Gareth Cochrane' }] }] })[0].detail).toBe('On your own'))

  it('an accepted match today: Live, opening its board', () => {
    const [x] = todayItems({ ...none, playerEvents: [pe({ status: 'accepted' })] })
    expect(x).toMatchObject({ kind: 'match', pill: { text: 'Live' }, go: { tab: 'scores', sview: 'pevent', peId: 5 } })
    expect(x.title).toMatch(/ match$/)
  })

  it('a league running today that I play in: opens its board on the Leaderboard', () => {
    expect(todayItems({ ...none, events: [league()] })).toEqual([{ kind: 'event', title: 'Winter League', pill: null, detail: 'Your round today can count', go: { tab: 'lb', lbv: 9 } }])
  })
  it('a club event today that I play in', () => {
    const e = { id: 4, name: 'Autumn Cup', style: 'ryder', club: true, startDate: TODAY, days: 1, players: [1] }
    expect(todayItems({ ...none, events: [e] })[0]).toMatchObject({ kind: 'event', detail: 'Today' })
  })
  it('a league I\'m not in: no row', () => expect(todayItems({ ...none, events: [league({ players: [3] })] })).toEqual([]))
  it('a league that ended yesterday: no row', () => expect(todayItems({ ...none, events: [league({ startDate: '2026-09-28', weeks: 1 })] })).toEqual([]))
  it('a players\' own event (not club, not league): no row', () => {
    expect(todayItems({ ...none, events: [{ id: 6, name: 'Sunday Four', style: 'teams', club: false, startDate: TODAY, days: 1, players: [1] }] })).toEqual([])
  })

  it('everything at once: invitation, card, match, event in that order', () => {
    const items = todayItems({ ...none, card: card(), teeTimes: [{ id: 10, time: 490, players: [] }],
      playerEvents: [pe({ id: 7, status: 'accepted' }), pe()], events: [league()] })
    expect(kinds(items)).toEqual(['invite', 'card', 'match', 'event'])
  })
})

import { nextUp } from './home-today.js'
describe('nextUp: what Home leads with', () => {
  const item = kind => ({ kind, title: kind, pill: null, detail: '', go: {} })
  it('nothing on: nothing', () => expect(nextUp([])).toEqual({ next: null, needs: [], more: [] }))
  it('invitations need you; the first other thing is next up; the rest follow', () => {
    const r = nextUp([item('invite'), item('card'), item('match'), item('event')])
    expect(r.needs.map(x => x.kind)).toEqual(['invite'])
    expect(r.next.kind).toBe('card')
    expect(r.more.map(x => x.kind)).toEqual(['match', 'event'])
  })
  it('only an invitation: it needs you, nothing is next up', () => {
    const r = nextUp([item('invite')])
    expect(r.next).toBeNull()
    expect(r.needs).toHaveLength(1)
  })
})

describe('todayItems: answered tee time requests (shown once)', () => {
  const me = { id: 1 }
  const req = over => ({ id: 3, date: '2026-11-14', time: 490, status: 'approved', note: null, decidedAt: '2026-10-08T10:00:00Z', seen: false, ...over })
  const base = { me, card: null, teeTimes: [], playerEvents: [], events: [], date: '2026-10-09' }
  it('approved and not seen: a row that opens your bookings', () => {
    expect(todayItems({ ...base, requests: [req()] })).toEqual([{ kind: 'request', title: 'Request approved: Sat 14 Nov 08:10', pill: null, detail: 'Booked. It’s in your bookings.', go: { tab: 'home', aview: 'mine' } }])
  })
  it('declined: the admin\'s note', () => expect(todayItems({ ...base, requests: [req({ status: 'declined', note: 'Full, try 08:30' })] })[0]).toMatchObject({ title: 'Request declined: Sat 14 Nov 08:10', detail: 'Full, try 08:30' }))
  it('not shown once seen, while waiting, or after 7 days', () => {
    expect(todayItems({ ...base, requests: [req({ seen: true }), req({ status: 'pending' }), req({ decidedAt: '2026-10-01T10:00:00Z' })] })).toEqual([])
  })
  it('needs you on Home, after any invitation', () => {
    const r = nextUp([{ kind: 'invite' }, { kind: 'request' }, { kind: 'card' }])
    expect(r.needs.map(x => x.kind)).toEqual(['invite', 'request'])
    expect(r.next.kind).toBe('card')
  })
})
