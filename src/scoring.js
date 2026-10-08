// Golf scoring rules. Pure functions only: no DOM, no data access, so they can be tested
// on their own and reused by any screen (or a server later).
//
// Shapes used throughout:
//   hole    = { par, si }                      stroke index 1 (hardest) to 18
//   scores  = gross[] per hole, one entry per player, e.g. scores[holeIdx][playerIdx]
//   phs     = playing handicap per player (after allowance)
//   order   = [a1, a2, b1, b2] player indexes for pairs games (side A first)

const HOLES_IN_ROUND = 18

/** WHS course handicap: index × slope / 113 + (course rating − par), rounded. */
export function courseHandicap(index, { slope, rating, par }) {
  return Math.round((index * slope) / 113 + (rating - par))
}

/**
 * Playing handicaps for a game. allowance is a fraction (0.9 = 90%); 0 means scratch.
 * offLow gives shots off the lowest playing handicap, so the low player plays off 0.
 */
export function playingHandicaps(courseHcps, allowance, offLow = false) {
  const ps = courseHcps.map(c => Math.round(c * allowance) || 0)
  if (!offLow) return ps
  const lo = Math.min(...ps)
  return ps.map(p => p - lo)
}

/**
 * Shots received on a hole. 20 → 2 on SI 1–2 and 1 elsewhere.
 * Plus handicaps give shots back, starting from SI 18: −2 → −1 on SI 17 and 18.
 */
export function shotsOnHole(ph, si) {
  if (ph >= 0) return Math.floor(ph / HOLES_IN_ROUND) + (si <= ph % HOLES_IN_ROUND ? 1 : 0)
  const give = -ph
  return -(Math.floor(give / HOLES_IN_ROUND) + (si > HOLES_IN_ROUND - (give % HOLES_IN_ROUND) ? 1 : 0)) || 0 // no −0
}

/** Stableford points: 2 for a net par, one more per stroke better, never below 0. null = no score. */
export function stablefordPoints(gross, par, shots) {
  if (gross == null) return 0
  return Math.max(0, 2 + par - (gross - shots))
}

/** Everything about one hole for one group: shots, nets, points, and the best of each side. */
export function holeCalc(hole, gross, phs, order = [0, 1, 2, 3]) {
  const sh = phs.map(ph => shotsOnHole(ph, hole.si))
  const net = gross.map((g, k) => g - sh[k])
  const pts = gross.map((g, k) => stablefordPoints(g, hole.par, sh[k]))
  const [a1, a2, b1, b2] = order
  return {
    sh, net, pts,
    nA: Math.min(net[a1], net[a2]), nB: Math.min(net[b1], net[b2]),
    pA: Math.max(pts[a1], pts[a2]), pB: Math.max(pts[b1], pts[b2]),
  }
}

/** Better-ball hole winner: 1 side A, −1 side B, 0 halved. cmp 'net' = lower net, 'pts' = more points. */
export function betterBallWinner(c, cmp = 'net') {
  if (cmp === 'pts') return Math.sign(c.pA - c.pB)
  return Math.sign(c.nB - c.nA)
}

/** Short match status after a hole, from side A's view: "AS", "2 up", "1 dn". */
export const upText = d => (d === 0 ? 'AS' : `${Math.abs(d)} ${d > 0 ? 'up' : 'dn'}`)

/**
 * Match play from a list of hole winners (1 / −1 / 0, side A's view).
 * Stops counting once the match is decided. Returns running status per hole and the result.
 */
export function matchProgress(winners, holes = HOLES_IN_ROUND) {
  let diff = 0, thru = 0, over = false
  const running = []
  for (const w of winners) {
    if (over) break
    diff += w
    thru++
    running.push(diff)
    // Won when the lead is more than the holes left. On the last hole a lead is just "n up".
    if (thru < holes && Math.abs(diff) > holes - thru) over = true
  }
  const finished = over || thru === holes
  let text
  if (over) text = `${Math.abs(diff)}&${holes - thru}`
  else if (thru === holes) text = diff ? `${Math.abs(diff)} up` : 'Halved'
  else text = diff ? `${Math.abs(diff)} up` : 'All square'
  return { diff, thru, over, finished, running, text, lead: diff > 0 ? 'A' : diff < 0 ? 'B' : null }
}

/**
 * Skins from per-hole nets. The single lowest net wins the hole plus any carried skins;
 * a tie carries the skin to the next hole.
 * Returns winner per hole (player index or −1 for carried), totals, and skins still carrying.
 */
export function skins(netsByHole, players = netsByHole[0]?.length ?? 0) {
  const totals = Array(players).fill(0), winners = []
  let carry = 0
  for (const net of netsByHole) {
    const lo = Math.min(...net)
    const w = net.filter(n => n === lo).length === 1 ? net.indexOf(lo) : -1
    carry++
    if (w >= 0) { totals[w] += carry; carry = 0 }
    winners.push(w)
  }
  return { totals, winners, carry }
}

/**
 * Full state of the 4-ball game being played on the scorecard.
 * game = { kind: 'match' | 'stab' | 'skins' | 'stroke', cmp?: 'net' | 'pts' }
 * played = number of holes completed (scores beyond that are ignored).
 *
 * holes[i] per kind:  match → { diff }   stab → { pts }   skins → { winner }   stroke → { toPar } (player 0)
 * totals per player:  stab → points   skins → skins won   stroke → net to par   match → unused (zeros)
 */
export function gameState(game, holes, phs, scores, played, order = [0, 1, 2, 3]) {
  const n = phs.length, perHole = [], totals = Array(n).fill(0)
  const calcs = holes.slice(0, played).map((h, i) => holeCalc(h, scores[i], phs, order))

  if (game.kind === 'match') {
    const m = matchProgress(calcs.map(c => betterBallWinner(c, game.cmp)))
    m.running.forEach(diff => perHole.push({ diff }))
    return { holes: perHole, totals, thru: m.thru, finished: m.finished, match: m }
  }
  if (game.kind === 'skins') {
    const s = skins(calcs.map(c => c.net), n)
    s.winners.forEach(winner => perHole.push({ winner }))
    return { holes: perHole, totals: s.totals, carry: s.carry, thru: played, finished: played === HOLES_IN_ROUND }
  }
  calcs.forEach((c, i) => {
    if (game.kind === 'stab') {
      c.pts.forEach((p, k) => (totals[k] += p))
      perHole.push({ pts: c.pts[0] })
    } else {
      c.net.forEach((x, k) => (totals[k] += x - holes[i].par))
      perHole.push({ toPar: c.net[0] - holes[i].par })
    }
  })
  return { holes: perHole, totals, thru: played, finished: played === HOLES_IN_ROUND }
}

/** One player's round so far for the leaderboard: gross and net to par, Stableford, birdies, eagles. */
export function roundSummary(holes, gross, ch) {
  let g = 0, n = 0, pts = 0, bd = 0, eag = 0
  gross.forEach((sc, i) => {
    const { par, si } = holes[i], sh = shotsOnHole(ch, si)
    g += sc - par
    n += sc - sh - par
    pts += stablefordPoints(sc, par, sh)
    if (sc < par) bd++
    if (sc <= par - 2) eag++
  })
  return { thru: gross.length, g, n, pts, bd, eag }
}

/** Gross/net to par as shown on the leaderboard: "E", "+3", "−2" (ASCII minus). */
export const toPar = v => (v === 0 ? 'E' : (v > 0 ? '+' : '') + v)

/**
 * Team event points. Each match is worth 1; a half gives ½ each.
 * match.res = { st: 'done' | 'live' | 'ns', d }  where d > 0 means team A is ahead.
 * Confirmed counts finished matches; projected also counts live ones as they stand.
 */
export function teamEventScore(matches) {
  let cA = 0, cB = 0, pA = 0, pB = 0
  for (const { res } of matches) {
    if (res.st !== 'done' && res.st !== 'live') continue
    const a = res.d > 0 ? 1 : res.d < 0 ? 0 : 0.5
    pA += a
    pB += 1 - a
    if (res.st === 'done') { cA += a; cB += 1 - a }
  }
  const tot = matches.length
  return { cA, cB, pA, pB, tot, toWin: tot / 2 + 0.5 }
}

/** Points with halves shown as ½: 2.5 → "2½", 0.5 → "½". */
export const fmtPts = n => (Number.isInteger(n) ? String(n) : Math.floor(n) ? `${Math.floor(n)}½` : '½')
