// What drops down from the header (alert-bar.js draws it): another four-ball's match challenge for my group, and
// answers to my tee time requests. Plain function of data the api already returns, tested in alerts.test.js.
import { needsMyAnswer } from './home-today.js'
import { eventFormatName } from './games.js'
import { hhmm, longDay, fromIso } from './dates.js'
import { hutPromptDue } from './hut.js'

const WEEK = 7 * 864e5
const later = { id: 'later', label: 'Later' }

/**
 * → [{ key, kind: 'challenge' | 'request', title, detail, actions: [{ id, label, primary? }], ref: { peId? , reqId? } }],
 * challenges first, then answered requests (oldest answer first), then halfway hut orders ready to collect, then the
 * hut's "would you like to order?" after hole 8. Keys in `hidden` (Later) are left out.
 * hut = { on, card, asked: cardIds, orders: my orders today, seen: ready orders already OK'd }
 */
export function pickAlerts({ me, playerEvents, requests, date, now = Date.now(), hidden = new Set(), hut = null }) {
  const challenges = playerEvents.filter(e => e.date === date && needsMyAnswer(e, me)).map(e => {
    const theirs = e.groups.find(g => g.slot === (e.proposerSlot ?? e.groups.find(x => x.host)?.slot))
    return {
      key: `pe:${e.id}`, kind: 'challenge', ref: { peId: e.id },
      title: `${e.proposedBy?.name ?? 'Another member'}'s four-ball${theirs ? ` (${hhmm(theirs.time)})` : ''} has challenged your group`,
      detail: eventFormatName(e.format),
      actions: [{ id: 'accept', label: 'Accept', primary: true }, { id: 'decline', label: 'Decline' }, { id: 'details', label: 'See details' }, later],
    }
  })
  const answered = requests
    .filter(r => (r.status === 'approved' || r.status === 'declined') && !r.seen && r.decidedAt && now - Date.parse(r.decidedAt) < WEEK)
    .sort((a, b) => Date.parse(a.decidedAt) - Date.parse(b.decidedAt))
    .map(r => ({
      key: `rq:${r.id}`, kind: 'request', ref: { reqId: r.id },
      title: `Request ${r.status}: ${longDay(fromIso(r.date))} ${hhmm(r.time)}`,
      detail: r.status === 'approved' ? 'Booked. It’s in your bookings.' : r.note || 'No reason given',
      actions: [{ id: 'ok', label: 'OK', primary: true }, later],
    }))
  const ready = (hut?.orders ?? []).filter(o => o.status === 'ready' && !hut.seen.includes(o.id)).map(o => ({
    key: `hutok:${o.id}`, kind: 'hutready', ref: { orderId: o.id },
    title: 'Your halfway hut order is ready', detail: o.items.map(i => (i.qty > 1 ? `${i.qty} × ${i.name}` : i.name)).join(', '),
    actions: [{ id: 'ok', label: 'OK', primary: true }],
  }))
  const prompt = hut && hutPromptDue(hut) ? [{
    key: `hut:${hut.card.id}`, kind: 'hut', ref: { cardId: hut.card.id },
    title: 'Halfway hut is open', detail: 'Would you like to place an order?',
    actions: [{ id: 'order', label: 'Order', primary: true }, { id: 'nothanks', label: 'No thanks' }],
  }] : []
  return [...challenges, ...answered, ...ready, ...prompt].filter(a => !hidden.has(a.key))
}

/** Look for alerts on a new screen, or at most once a minute while the same screen redraws (a scorecard redraws on every tap). */
export const alertCheckDue = (lastPlace, place, lastAt, now) => lastPlace !== place || now - lastAt > 60e3
