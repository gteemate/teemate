// Knockout draws: round names, my next match, what I can do on a match, names for entries, the champion, and a
// match's state from its scorecard.
// Plain functions of what the api returns, tested in knockout.test.js. The server does the draw and moves winners on.
import { addDaysIso } from './dates.js'
import { gameState, playingHandicaps } from './scoring.js'

/** 'Final', 'Semi-finals', 'Quarter-finals', then 'Round of 16', 'Round of 32'… */
export function roundName(round, rounds) {
  const left = rounds - round
  return left === 0 ? 'Final' : left === 1 ? 'Semi-finals' : left === 2 ? 'Quarter-finals' : `Round of ${2 ** (left + 1)}`
}

const settled = m => m.status === 'confirmed' || m.status === 'bye'

/** My earliest match without a result yet, or null (knocked out, or all done). */
export function myNextMatch(matches, myEntry) {
  return [...matches].sort((a, b) => a.round - b.round).find(m => (m.aEntry === myEntry || m.bEntry === myEntry) && !settled(m)) ?? null
}

/** On a match of mine: 'report' | 'waiting' (opponent not known) | 'reported' (by me) | 'confirm' (by them) | 'disputed' | 'done'. */
export function matchState(m, myEntry) {
  if (settled(m)) return 'done'
  if (m.status === 'disputed') return 'disputed'
  if (m.status === 'reported') return m.reportedEntry === myEntry ? 'reported' : 'confirm'
  return m.aEntry == null || m.bEntry == null ? 'waiting' : 'report'
}

/** A side's name: 'Gary Cochrane', or 'Peter Reid & Liam Quinn' for a pair; 'Bye' / 'To be decided' when empty. */
export function entryName(id, entries, members, bye = false) {
  if (id == null) return bye ? 'Bye' : 'To be decided'
  const e = entries.find(x => x.id === id), n = mid => members.find(x => x.id === mid)?.name ?? 'Former member'
  return e ? (e.partnerId ? `${n(e.memberId)} & ${n(e.partnerId)}` : n(e.memberId)) : 'To be decided'
}

/** The champion's entry: the final's confirmed winner, or null. */
export const champion = (matches, rounds) => matches.find(m => m.round === rounds && m.status === 'confirmed')?.winnerEntry ?? null

/** Play-by dates for each round, spread evenly from `from` to the finish date (the final's). [] if the finish is earlier. */
export function spreadDates(from, to, rounds) {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 864e5)
  if (days <= 0 || rounds < 1) return []
  return Array.from({ length: rounds }, (_, i) => addDaysIso(from, Math.round((days * (i + 1)) / rounds)))
}

/** An entry's players: [memberId] or [memberId, partnerId]. */
export const entryPlayers = (id, entries) => { const e = entries.find(x => x.id === id); return e ? [e.memberId, ...(e.partnerId ? [e.partnerId] : [])] : [] }

/** How a knockout card is scored: the card's game when it's net match play, else singles at the full difference
 *  and pairs (better ball) at 90%, shots off the low handicap. spec = gameSpec of the card's game, or null. */
export function koSpec(spec, pairs) {
  if (spec && (spec.kind === 'match1' || spec.kind === 'match')) return { cmp: spec.cmp ?? 'net', allow: spec.allow, offLow: !!spec.offLow }
  return { cmp: 'net', allow: pairs ? 0.9 : 1, offLow: true }
}

/**
 * A knockout match from its scorecard. card = { lineup, scores, done } (holes saved in order); sides = [side A's member
 * ids, side B's]; ch(memberId) = course handicap; spec from koSpec. Side A plays side B whatever order the card is in.
 * → { run (side A's lead after each hole), thru, finished, text ('3&2', '1 up', 'Halved', 'All square'), lead: 0 | 1 | null,
 *     players: [{ id, side, gross: [per hole], ph }] } — or null when the card doesn't have both sides on it.
 */
export function koCardState(card, holes, sides, ch, spec) {
  const ids = sides.flat(), idx = ids.map(id => card.lineup.findIndex(x => x.m === id))
  if (!ids.length || idx.includes(-1) || sides.some(s => !s.length)) return null
  const pairs = sides[0].length === 2 && sides[1].length === 2
  const phs = playingHandicaps(ids.map(ch), spec.allow, spec.offLow)
  const scores = card.scores.map(row => idx.map(k => row[k]))
  const first = card.done.findIndex(d => !d), played = first === -1 ? card.done.length : first
  const g = gameState({ kind: pairs ? 'match' : 'match1', cmp: spec.cmp }, holes, phs, scores, played, [0, 1, 2, 3]).match
  return {
    run: g.running, thru: g.thru, finished: g.finished, text: g.text, lead: g.lead === 'A' ? 0 : g.lead === 'B' ? 1 : null,
    players: ids.map((id, j) => ({ id, side: j < sides[0].length ? 0 : 1, gross: holes.map((_, i) => (i < played ? scores[i][j] : null)), ph: phs[j] })),
  }
}
