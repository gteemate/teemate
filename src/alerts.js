// What drops down from the header (alert-bar.js draws it): another four-ball's match challenge for my group, and
// answers to my tee time requests. Plain function of data the api already returns, tested in alerts.test.js.
import { needsMyAnswer } from './home-today.js'
import { eventFormatName } from './games.js'
import { hhmm, longDay, fromIso } from './dates.js'
import { hutPromptDue } from './hut.js'

const WEEK = 7 * 864e5
const later = { id: 'later', label: 'Later' }

/**
 * → [{ key, kind: 'notice' | 'challenge' | 'request' | 'hutready' | 'hut', title, detail, actions: [{ id, label, primary? }], ref: { peId? , reqId? } }],
 * the club office's changes to my tee times first, then bookings someone made for me, then challenges, then answered requests (oldest answer first), then halfway hut orders ready to collect, then the
 * hut's "would you like to order?" after hole 8. Keys in `hidden` (Later) are left out.
 * hut = { on, card, asked: cardIds, orders: my orders today, seen: ready orders already OK'd }
 */
export function pickAlerts({ me, playerEvents, requests, date, now = Date.now(), hidden = new Set(), hut = null, notices = [], paper = [], koDue = [] }) {
  const challenges = playerEvents.filter(e => e.date === date && needsMyAnswer(e, me)).map(e => {
    const theirs = e.groups.find(g => g.slot === (e.proposerSlot ?? e.groups.find(x => x.host)?.slot))
    return {
      key: `pe:${e.id}`, kind: 'challenge', ref: { peId: e.id },
      title: e.style === 'singles' ? `${e.proposedBy?.name ?? 'Another member'}${theirs ? ` (${hhmm(theirs.time)})` : ''} has challenged you to a one-on-one`
        : `${e.proposedBy?.name ?? 'Another member'}'s four-ball${theirs ? ` (${hhmm(theirs.time)})` : ''} has challenged your group`,
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
  // Someone booked me onto a tee time (not shown once the day has passed).
  const names = l => (l.length > 1 ? `${l.slice(0, -1).join(', ')} and ${l.at(-1)}` : l[0])
  const added = notices.filter(n => n.kind === 'added' && n.date >= date).map(n => ({
    key: `bn:${n.id}`, kind: 'notice', ref: { noticeId: n.id },
    title: `${n.byName} has booked you in`,
    detail: `${longDay(fromIso(n.date))} at ${hhmm(n.oldTime)}${n.withNames?.length ? ` · with ${names(n.withNames)}` : ''}`,
    actions: [{ id: 'ok', label: 'OK', primary: true }, { id: 'bookings', label: 'See my bookings' }],
  }))
  // Find a time: someone suggested days for my knockout match; everyone can do one; or the play-by date is close and
  // nothing's arranged (once a day).
  const times = notices.filter(n => (n.kind === 'times' || n.kind === 'agreed') && n.date >= date).map(n => ({
    key: `bn:${n.id}`, kind: 'notice', ref: { noticeId: n.id, matchId: n.koMatchId },
    title: n.kind === 'times' ? `${n.byName} suggests times for your ${n.note} match` : `Everyone can do ${longDay(fromIso(n.date))} · ${n.part}`,
    detail: n.kind === 'times' ? 'Tick the days you can do.' : `Your ${n.note} match: book a tee time that ${n.part}.`,
    actions: [{ id: 'times', label: n.kind === 'times' ? 'See the times' : 'Book a tee time', primary: true }, later],
  }))
  const due = koDue.map(d => ({
    key: `kd:${d.matchId}:${date}`, kind: 'findtime', ref: { matchId: d.matchId, compId: d.compId },
    title: `Your ${d.compName} match isn’t arranged yet: play by ${longDay(fromIso(d.by))}`,
    detail: 'Suggest a few days and the others tick the ones they can do.',
    actions: [{ id: 'findtime', label: 'Find a time', primary: true }, later],
  }))
  // A score read from a paper card that I was asked to confirm.
  const confirm = paper.map(p => ({
    key: `pc:${p.id}:${p.at}`, kind: 'paperconfirm', ref: { roundId: p.id }, // a resent score is a new alert
    title: 'Please confirm a score', detail: `${p.byName} · ${p.gross} (Out ${p.out} · In ${p.in})`,
    actions: [{ id: 'pconfirm', label: 'Confirm', primary: true }, { id: 'pback', label: 'Not right' }, { id: 'pholes', label: 'See the holes' }, later],
  }))
  // The club office cancelled or moved one of my tee times.
  // The club office checked in my guests: the points used today and what's left.
  const guests = notices.filter(n => n.kind === 'guests').map(n => ({
    key: `bn:${n.id}`, kind: 'notice', ref: { noticeId: n.id },
    title: `${n.points} guest point${n.points === 1 ? '' : 's'} used today · ${n.pointsLeft} of ${n.allowance} left`,
    detail: `Checked in at the club office: ${(n.withNames ?? []).join(', ')}`,
    actions: [{ id: 'ok', label: 'OK', primary: true }],
  }))
  const office = notices.filter(n => n.kind === 'moved' || n.kind === 'cancelled').map(n => ({
    key: `bn:${n.id}`, kind: 'notice', ref: { noticeId: n.id },
    title: n.kind === 'moved' ? `Your ${hhmm(n.oldTime)} tee time on ${longDay(fromIso(n.date))} has moved to ${hhmm(n.newTime)}` : `Your ${hhmm(n.oldTime)} tee time on ${longDay(fromIso(n.date))} was cancelled`,
    detail: n.note ? `The club office: “${n.note}”` : n.kind === 'moved' ? 'The club office moved it. Everyone on the booking has been told.' : 'The club office cancelled it. Everyone on the booking has been told.',
    actions: [{ id: 'ok', label: 'OK', primary: true }],
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
  return [...office, ...guests, ...added, ...times, ...due, ...confirm, ...challenges, ...answered, ...ready, ...prompt].filter(a => !hidden.has(a.key))
}

/** Look for alerts on a new screen, or at most once a minute while the same screen redraws (a scorecard redraws on every tap). */
export const alertCheckDue = (lastPlace, place, lastAt, now) => lastPlace !== place || now - lastAt > 60e3
