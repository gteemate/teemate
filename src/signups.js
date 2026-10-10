// Sign-up competitions: who can enter which (Men's / Ladies' / Mixed / Open), what I'm in, and who I can partner.
// Plain functions of what the api returns, tested in signups.test.js. The server checks the same rules.

const inIt = (e, id) => e.memberId === id || e.partnerId === id
const eligible = (c, me) => c.category === 'open' || (c.category === 'mixed' ? !!me.playsIn : me.playsIn === c.category)
const isOpen = (c, date) => c.open && !!c.closesOn && date <= c.closesOn

/** Competitions → Events: open, not closed, I'm eligible for, and not already in (as a player or a partner). */
export function canEnter({ comps, entries, me, date }) {
  return comps.filter(c => isOpen(c, date) && eligible(c, me) && !entries.some(e => e.compId === c.id && inIt(e, me.id)))
}

/** Competitions → Entered: [{ comp, partnerId }] for each one I'm in (partnerId: who I play with, or null). */
export function myEntries({ comps, entries, me }) {
  return entries.filter(e => inIt(e, me.id)).map(e => ({ comp: comps.find(c => c.id === e.compId), partnerId: e.memberId === me.id ? e.partnerId : e.memberId }))
    .filter(x => x.comp)
}

/** Who I can enter a pair with: eligible for it (mixed: the other section), not me, not already in it. */
export function partnerChoices(comp, me, members, entries) {
  const taken = new Set(entries.filter(e => e.compId === comp.id).flatMap(e => [e.memberId, e.partnerId]))
  return members.filter(m => m.id !== me.id && !taken.has(m.id)
    && (comp.category === 'open' || (comp.category === 'mixed' ? !!m.playsIn && m.playsIn !== me.playsIn : m.playsIn === comp.category)))
}

/** Should Events ask me to set Men's or Ladies' (an open competition needs it and I haven't)? */
export const needsSection = (comps, me, date) => !me.playsIn && comps.some(c => isOpen(c, date) && c.category !== 'open')

/** Places left under a competition's limit (counts: { [compId]: entries }), or null when there's no limit. */
export const placesLeft = (c, counts) => (c.maxEntries == null ? null : Math.max(0, c.maxEntries - (counts[c.id] ?? 0)))

/** Competitions → Events: what's open to me, split into ones to answer (Enter / No thanks) and ones I said No thanks
 *  to (still enterable until they close). open: from canEnter; declined: [compId]. */
export const splitDeclined = (open, declined) => ({ offer: open.filter(c => !declined.includes(c.id)), declined: open.filter(c => declined.includes(c.id)) })
