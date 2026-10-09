// What drops down from the header (alert-bar.js draws it): another four-ball's match challenge for my group, and
// answers to my tee time requests. Plain function of data the api already returns, tested in alerts.test.js.
import { needsMyAnswer } from './home-today.js'
import { eventFormatName } from './games.js'
import { hhmm, longDay, fromIso } from './dates.js'

const WEEK = 7 * 864e5
const later = { id: 'later', label: 'Later' }

/**
 * → [{ key, kind: 'challenge' | 'request', title, detail, actions: [{ id, label, primary? }], ref: { peId? , reqId? } }],
 * challenges first, then answered requests (oldest answer first). Keys in `hidden` (Later) are left out.
 */
export function pickAlerts({ me, playerEvents, requests, date, now = Date.now(), hidden = new Set() }) {
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
  return [...challenges, ...answered].filter(a => !hidden.has(a.key))
}

/** Look for alerts on a new screen, or at most once a minute while the same screen redraws (a scorecard redraws on every tap). */
export const alertCheckDue = (lastPlace, place, lastAt, now) => lastPlace !== place || now - lastAt > 60e3
