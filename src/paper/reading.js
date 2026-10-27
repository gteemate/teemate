// Paper scorecards: what the reader sent back, turned into what the member checks. Pure, so it's tested on its own
// (reading.test.js). A column is one player's Score column on one card; open is the card's open hole indexes.

/** → [{ card: 1|2, label: 'A'|'B', holes: [{ score, sure }], out, in, total, blank }] */
export function toColumns(reading) {
  return reading.cards.flatMap((c, i) => c.columns.map(col => ({ card: i + 1, ...col, blank: col.holes.every(h => h.score == null) })))
}

const half = (col, open, from, written) => {
  const holes = open.filter(h => h >= from && h < from + 9)
  if (!holes.length || written == null) return null
  const sum = holes.reduce((s, h) => s + (col.holes[h].score ?? 0), 0)
  return { holes: sum, written, ok: sum === written }
}

/** The totals written on the card against the holes, and the open holes the reader wasn't sure of. */
export function colChecks(col, open) {
  return { out: half(col, open, 0, col.out), in: half(col, open, 9, col.in), unsure: open.filter(h => !col.holes[h].sure) }
}

/** The 18 scores to save: the open holes as read (or as fixed), null on closed holes. */
export const toScores = (col, open) => col.holes.map((h, i) => (open.includes(i) ? h.score : null))

/** A player's gross, Out and In on a saved card (scores[hole][player], blanks skipped). */
export function playerTotals(scores, k) {
  const add = (from, to) => scores.slice(from, to).reduce((s, h) => s + (h?.[k] ?? 0), 0)
  return { gross: add(0, 18), out: add(0, 9), in: add(9, 18) }
}

export const playerKey = e => (e.m != null ? `m${e.m}` : `g${e.g}`)

/** First guess: the card's players in order, one to each column with something written. */
export function guessPlayers(columns, lineup) {
  let next = 0
  return columns.map(c => (c.blank || next >= lineup.length ? null : playerKey(lineup[next++])))
}

/** null when the matching can be saved, else what's wrong. names: key → name. */
export function matchProblem(who, meKey, names) {
  const twice = who.find((k, i) => k && who.indexOf(k) !== i)
  if (twice) return `Two columns are set to ${names[twice] ?? 'the same player'}. Each player can only have one column.`
  if (!who.includes(meKey)) return 'Pick your own column.'
  return null
}
