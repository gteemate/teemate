// Home tab: what goes on Today, and which tab the app opens on. Plain functions of data the
// api already returns, so they're tested on their own (home-today.test.js).
import { eventLastDay, hhmm } from './dates.js'
import { GAME_DEFS, eventFormatName } from './games.js'

/** Scores while I'm mid-round (a hole saved on today's card, not finished); otherwise Home. */
export const startTab = card => (card && card.done.some(Boolean) && !card.submitted?.[card.game] ? 'scores' : 'home')

const gameName = k => Object.values(GAME_DEFS).flatMap(d => d.games).find(g => g.k === k)?.name ?? 'Scorecard'
const holesPlayed = done => { const i = done.findIndex(d => !d); return i === -1 ? done.length : i }
const times = e => e.groups.map(g => hhmm(g.time)).join(' v ')
// As on the Scores tab: the group whose version is on the table, or the host group.
const proposerSlot = e => e.proposerSlot ?? e.groups.find(g => g.host)?.slot

/**
 * Rows for Today, in order: an invitation my group must answer, my card (or my tee time if no card yet),
 * a match on today, a club event or league I'm playing in today.
 * [{ kind, title, pill: null | { text, gold? }, detail, go }]; go = where tapping it takes you.
 */
export function todayItems({ me, card, teeTimes, playerEvents, events, date }) {
  const items = []
  const todays = playerEvents.filter(e => e.date === date)
  for (const e of todays.filter(e => e.status === 'pending')) {
    const mySlot = e.players.find(p => p.memberId === me.id)?.slot
    const mine = e.groups.find(g => g.slot === mySlot)
    if (!mine || mySlot === proposerSlot(e) || mine.answer != null) continue
    items.push({ kind: 'invite', title: `Invitation from ${e.proposedBy.name}`, pill: { text: 'Answer', gold: true }, detail: times(e), go: { tab: 'scores' } })
  }
  if (card) {
    const n = holesPlayed(card.done)
    items.push({ kind: 'card', title: gameName(card.game), pill: { text: card.submitted?.[card.game] ? 'Finished' : 'On the go' },
      detail: n ? `${n} hole${n > 1 ? 's' : ''} played` : 'not started', go: { tab: 'scores' } })
  } else if (teeTimes.length) {
    const t = teeTimes[0], others = t.players.filter(p => p.memberId !== me.id).map(p => p.name)
    items.push({ kind: 'tee', title: `Tee time ${hhmm(t.time)}`, pill: null, detail: others.length ? others.join(', ') : 'On your own', go: { tab: 'scores' } })
  }
  for (const e of todays.filter(e => e.status === 'accepted')) {
    items.push({ kind: 'match', title: `${eventFormatName(e.format)} match`, pill: { text: 'Live' }, detail: times(e), go: { tab: 'scores', sview: 'pevent', peId: e.id } })
  }
  for (const e of events.filter(e => (e.club || e.style === 'league') && e.startDate <= date && eventLastDay(e) >= date && e.players.includes(me.id))) {
    items.push({ kind: 'event', title: e.name, pill: null, detail: e.style === 'league' ? 'Your round today can count' : 'Today', go: { tab: 'lb', lbv: e.id } })
  }
  return items
}
