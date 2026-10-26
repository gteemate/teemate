// One match in four-ball team match play, whatever its type and the day's rules: a four-ball (2 v 2), a singles
// (1 v 1) or a 3-ball (2 v 1, the pair's better ball against the single), over the day's holes (from hole 1, with
// handicaps scaled to them), hole by hole (better ball off the low, Stableford points, scratch) or by Stableford
// points totalled over the holes. Each team's points for a win come from the day's points; a halve is half of each.
import { holesFor, scaleHcp } from './open-holes.js'
import { playingHandicaps, stablefordPoints, matchProgress } from './scoring.js'

export const DEFAULT_POINTS = { four: 1, singles: 1, threePair: 1, threeSingle: 2 }

/** 'four' (2 v 2), 'singles' (1 v 1) or 'three' (2 v 1, either way round). */
export const matchType = m => (m.a.length + m.b.length === 4 ? 'four' : m.a.length + m.b.length === 2 ? 'singles' : 'three')

/** A match day's holes (open-holes.js: null = all 18) and points: the day's own, over the event's, over the defaults. */
export function dayRules(e, d) {
  const day = e.dayRules?.[d] ?? {}
  return { holes: holesFor(e, d), points: { ...DEFAULT_POINTS, ...(e.points ?? {}), ...(day.points ?? {}) } }
}

/** Shots on a hole of rank `rank` over n holes. Plus handicaps give shots back from the easiest holes. */
export function shotsOn(ph, rank, n = 18) {
  if (ph >= 0) return Math.floor(ph / n) + (rank <= ph % n ? 1 : 0)
  const give = -ph
  return -(Math.floor(give / n) + (rank > n - (give % n) ? 1 : 0)) || 0 // no −0
}

/**
 * Score a match. a, b: [{ id, courseHcp, gross: [18] }] (team A's side, team B's side). fmt: 'bbl' | 'bbstab' | 'bbscr'
 * | 'stabtot'. allow: { four, singles, stab } as fractions. holes: the day's open holes (openCourse). points: the day's points.
 * → { res: { st: 'ns'|'live'|'done', d, txt, thru }, match (as matchProgress), win: { A, B }, ph: { [id]: shots } }
 */
export function scoreMatch({ holes, a, b, fmt, allow, points = DEFAULT_POINTS }) {
  const n = holes.length, all = [...a, ...b]
  const type = matchType({ a, b })
  // Handicaps: Stableford total at each player's own (no off the low); a singles always off the low (as the club
  // knockout); a four-ball or 3-ball off the low only for 'bbl'. Scratch gives none. Then scaled to the holes.
  const total = fmt === 'stabtot'
  const pct = total ? allow.stab : fmt === 'bbscr' ? 0 : type === 'singles' ? allow.singles : allow.four
  const offLow = !total && (type === 'singles' || fmt === 'bbl')
  const ph = playingHandicaps(all.map(p => p.courseHcp), pct, offLow).map(x => scaleHcp(x, n))
  const cmpPts = total || fmt === 'bbstab'
  let thru = 0
  while (thru < n && all.every(p => p.gross[thru] != null)) thru++
  // Each side's best on each hole played: lowest net, or most Stableford points.
  const best = (side, from, i) => {
    const vals = side.map((p, k) => {
      const sh = shotsOn(ph[from + k], holes[i].si, n)
      return cmpPts ? stablefordPoints(p.gross[i], holes[i].par, sh) : p.gross[i] - sh
    })
    return cmpPts ? Math.max(...vals) : Math.min(...vals)
  }
  const A = [], B = []
  for (let i = 0; i < thru; i++) { A.push(best(a, 0, i)); B.push(best(b, a.length, i)) }
  let match
  if (total) {
    let diff = 0
    const running = A.map((x, i) => (diff += x - B[i]))
    const tA = A.reduce((s, x) => s + x, 0), tB = B.reduce((s, x) => s + x, 0)
    match = { diff: tA - tB, thru, over: false, finished: thru === n, running, text: `${Math.max(tA, tB)} – ${Math.min(tA, tB)}` /* the leader's total first */, lead: tA > tB ? 'A' : tB > tA ? 'B' : null }
  } else {
    match = matchProgress(A.map((x, i) => Math.sign(cmpPts ? x - B[i] : B[i] - x)), n)
  }
  const res = { st: match.thru === 0 ? 'ns' : match.finished ? 'done' : 'live', d: match.diff, txt: match.text, thru: match.thru }
  const win = type === 'four' ? { A: points.four, B: points.four } : type === 'singles' ? { A: points.singles, B: points.singles }
    : a.length === 1 ? { A: points.threeSingle, B: points.threePair } : { A: points.threePair, B: points.threeSingle }
  return { res, match, win, type, holes: n, ph: Object.fromEntries(all.map((p, k) => [p.id, ph[k]])) }
}

/** One match's points: projected (pA, pB; a live match counts as it stands) and confirmed (cA, cB); avail = most it's worth. */
export function matchPoints({ res, win }) {
  const share = side => (res.d === 0 ? win[side] / 2 : (side === 'A') === (res.d > 0) ? win[side] : 0)
  const on = res.st === 'done' || res.st === 'live', done = res.st === 'done'
  return { pA: on ? share('A') : 0, pB: on ? share('B') : 0, cA: done ? share('A') : 0, cB: done ? share('B') : 0, avail: Math.max(win.A, win.B) }
}
