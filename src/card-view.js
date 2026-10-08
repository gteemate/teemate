// A group shares one scorecard. It's stored in the order the card was started (the starter first),
// but each player sees it from their own seat: themselves first, so "You", "(you)" and "your pair"
// read right on every phone. These turn a stored card into my view of it and back again.
import { PAIRINGS } from './games.js'

/** perm[v] = stored position shown at view position v (me first, the rest in card order). */
export function viewPerm(lineup, meId) {
  const k = lineup.findIndex(e => e.m === meId)
  return k <= 0 ? lineup.map((_, i) => i) : [k, ...lineup.map((_, i) => i).filter(i => i !== k)]
}

// Better-ball pairings by who partners position 0. Re-express pairing p (in positions `from`) in
// positions `to`, where to[i] = the position in the other frame of position i.
function mapPairing(p, to) {
  const o = PAIRINGS[p] ?? PAIRINGS[0]
  const sideOf = Array(4)
  o.forEach((x, i) => (sideOf[to[x]] = i < 2 ? 'A' : 'B'))
  const partner = [1, 2, 3].find(x => sideOf[x] === sideOf[0])
  return Math.max(0, PAIRINGS.findIndex(q => q[1] === partner))
}

const inverse = perm => perm.reduce((inv, s, v) => ((inv[s] = v), inv), [])

/** My view of a stored card ({ lineup, scores, pairing, ... }). Keeps perm so it can be stored back. */
export function toView(card, meId) {
  const perm = viewPerm(card.lineup, meId)
  return {
    ...card,
    perm,
    lineup: perm.map(s => card.lineup[s]),
    scores: card.scores.map(row => perm.map(s => row[s])),
    entered: card.entered && card.entered.map(row => perm.map(s => row[s])),
    pairing: card.lineup.length === 4 ? mapPairing(card.pairing, inverse(perm)) : card.pairing,
  }
}

/** Back to the stored order. A card with no perm (one I started fresh) is stored as it is. */
export function toStored(view) {
  const { perm, ...card } = view
  if (!perm) return card
  const inv = inverse(perm)
  return {
    ...card,
    lineup: inv.map(v => view.lineup[v]),
    scores: view.scores.map(row => inv.map(v => row[v])),
    entered: view.entered && view.entered.map(row => inv.map(v => row[v])),
    pairing: view.lineup.length === 4 ? mapPairing(view.pairing, perm) : view.pairing,
  }
}

// How much to trust a score: untouched (still the default par) 0, typed in by someone else 1,
// typed in by the player themselves 2. entered[i][k] is the member who last typed hole i for player k.
export const trust = (card, i, k) => {
  const by = card.entered?.[i]?.[k]
  return by == null ? 0 : by === card.lineup[k].m ? 2 : 1
}

/**
 * Saving while someone else on the card may have saved since I loaded it. Both cards in the same
 * (stored) order. changed: the "hole:player" cells I typed in since loading. For each score:
 * one I didn't change is left as they have it; one I did change replaces theirs unless theirs is
 * more trustworthy (e.g. Peter's own bogey beats the par I typed for him).
 */
export function mergeSaved(mine, theirs, changed = new Set()) {
  const scores = [], entered = []
  mine.scores.forEach((row, i) => {
    scores.push([]); entered.push([])
    row.forEach((v, k) => {
      const useMine = changed.has(`${i}:${k}`) && trust(mine, i, k) >= trust(theirs, i, k)
      scores[i].push(useMine ? v : theirs.scores[i][k])
      entered[i].push(useMine ? mine.entered?.[i]?.[k] ?? null : theirs.entered?.[i]?.[k] ?? null)
    })
  })
  return {
    ...mine, scores, entered,
    done: mine.done.map((d, i) => d || !!theirs.done[i]),
    submitted: { ...theirs.submitted, ...mine.submitted },
  }
}
