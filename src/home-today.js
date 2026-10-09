// Which tab the app opens on, and whether a match invitation needs my group's answer. Plain functions of data the
// api already returns, so they're tested on their own (home-today.test.js).

/** Scores while I'm mid-round (a hole saved on today's card, not finished); otherwise Home. */
export const startTab = card => (card && card.done.some(Boolean) && !card.submitted?.[card.game] ? 'scores' : 'home')

// As on the Scores tab: the group whose version is on the table, or the host group.
const proposerSlot = e => e.proposerSlot ?? e.groups.find(g => g.host)?.slot

/** A player event (match) invitation my group still has to answer (not one my group proposed). */
export function needsMyAnswer(e, me) {
  if (e.status !== 'pending') return false
  const mySlot = e.players.find(p => p.memberId === me.id)?.slot
  const mine = e.groups.find(g => g.slot === mySlot)
  return !!mine && mySlot !== proposerSlot(e) && mine.answer == null
}
