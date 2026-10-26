// The holes open for an event, a day of it, a league week or a knockout round. Stored as null (all 18), a number n
// (match days saved before holes could be picked: holes 1 to n) or a list of hole numbers. Scorers are given the
// open holes of the course: each keeps its course index (i) and number (n), its stroke index is ranked among the
// open holes (1 = hardest of them) and `of` is how many are open, so shots and handicaps follow the holes played.
const ALL = Array.from({ length: 18 }, (_, i) => i + 1)

/** The open hole numbers, in course order. */
export function holeList(spec) {
  if (spec == null) return ALL
  if (typeof spec === 'number') return ALL.slice(0, spec)
  return [...new Set(spec)].filter(n => n >= 1 && n <= 18).sort((a, b) => a - b)
}

export const allOpen = spec => holeList(spec).length === 18

/** The course's open holes: { ...hole, i: course index, n: hole number, si: rank among the open holes, of: count }. */
export function openCourse(courseHoles, spec) {
  const open = holeList(spec).filter(n => n <= courseHoles.length)
  const picked = open.map(n => ({ ...courseHoles[n - 1], i: n - 1, n }))
  const rank = [...picked].sort((a, b) => a.si - b.si)
  return picked.map(h => ({ ...h, si: rank.indexOf(h) + 1, of: picked.length }))
}

/** A playing handicap over k holes: scaled from 18 and rounded. */
export const scaleHcp = (ph, k) => (k === 18 ? ph : Math.round((ph * k) / 18) || 0)

/** A player's (lineup place k) saved gross scores on the open holes. */
export const cardGross = (card, k, holes) => holes.map(h => (k >= 0 && card.done[h.i] ? card.scores[h.i][k] : null))

// "1–6, 10–12": runs of holes in a row joined by a dash.
function runs(list) {
  const out = []
  list.forEach(n => (out.length && out[out.length - 1][1] === n - 1 ? (out[out.length - 1][1] = n) : out.push([n, n])))
  return out.map(([a, b]) => (a === b ? `${a}` : b === a + 1 ? `${a}, ${b}` : `${a}–${b}`)).join(', ')
}

/** "Holes 1–6, 10–12" ('' when all 18 are open). */
export function holesText(spec) {
  const l = holeList(spec)
  return l.length === 18 ? '' : l.length === 1 ? `Hole ${l[0]}` : `Holes ${runs(l)}`
}

/** The picker's line: "9 holes open: 1–6, 10–12". */
export function holesCount(spec) {
  const l = holeList(spec)
  return l.length === 18 ? 'All 18 holes open' : !l.length ? 'No holes open' : `${l.length} hole${l.length > 1 ? 's' : ''} open: ${runs(l)}`
}

/** Every hole a player (lineup place k) has saved, in course order: { holes: course indexes, gross }. */
export function savedHoles(card, k) {
  const holes = card.done.map((d, i) => (d ? i : -1)).filter(i => i >= 0)
  return { holes, gross: holes.map(i => card.scores[i][k]) }
}

/** A day's (or league week's) holes: its own, else the event's. */
export const holesFor = (e, d) => e.dayRules?.[d]?.holes ?? e.holes ?? null
