// Knockout draws: round names, my next match, what I can do on a match, names for entries, the champion.
// Plain functions of what the api returns, tested in knockout.test.js. The server does the draw and moves winners on.

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
