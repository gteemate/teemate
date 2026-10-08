// Scoring for player events (one group challenging others). Pure functions: the screen gathers each
// player's gross scores from their group's card and passes them in.
//
//   groups:  [{ key, name, players: [{ id, name, team, courseHcp, gross: [18 × number|null] }] }]
//   allow:   handicap allowance as a fraction (0.95 = 95%); 0 = scratch
//
// A hole counts for a group once everyone in that group has a score for it (cards save whole holes).
import { stablefordPoints, shotsOnHole, playingHandicaps, holeCalc, betterBallWinner, matchProgress, teamEventScore, courseHandicap } from './scoring.js'

/**
 * Build the scoring input from an event and each group's card.
 *   event.players: [{ id (booking player id), name, memberId, guest, slot, team }]
 *   cards: { [slotId]: { lineup: [{ m } | { g }], scores: [18][n], done: [18] } }
 *   indexOf(player): their handicap index (guests without one: 0)
 * Only saved holes count; a player missing from their group's card has no scores yet.
 */
export function buildEventGroups(event, holes, tee, cards, indexOf, timeOf = () => null) {
  return event.groups.map(g => {
    const card = cards[g.slot]
    const players = event.players.filter(p => p.slot === g.slot).map(p => {
      const k = card ? card.lineup.findIndex(x => (p.guest ? x.g === p.id : x.m === p.memberId)) : -1
      return {
        id: p.id, name: p.name, team: event.style === 'fourball' ? String(g.slot) : p.team,
        courseHcp: courseHandicap(indexOf(p) ?? 0, tee),
        gross: holes.map((_, i) => (k >= 0 && card.done[i] ? card.scores[i][k] : null)),
      }
    })
    return { key: String(g.slot), name: event.teamNames[g.slot] ?? timeOf(g), time: g.time, players, hasCard: !!card }
  })
}

/** Holes a group has completed, from the first hole on. */
export function groupThru(players) {
  let n = 0
  while (n < 18 && players.every(p => p.gross[n] != null)) n++
  return n
}

const points = (hole, gross, ph) => stablefordPoints(gross, hole.par, shotsOnHole(ph, hole.si))

/**
 * Four-ball v four-ball, Stableford: each group scores its best `count` points on every hole
 * (count = 2 for "best 2", Infinity for "all 4"). Returns groups ranked by points.
 */
export function groupStableford(holes, groups, allow, count) {
  const rows = groups.map(g => {
    const ph = playingHandicaps(g.players.map(p => p.courseHcp), allow)
    const thru = groupThru(g.players)
    let total = 0
    for (let i = 0; i < thru; i++) {
      const pts = g.players.map((p, k) => points(holes[i], p.gross[i], ph[k])).sort((a, b) => b - a)
      total += pts.slice(0, count).reduce((t, x) => t + x, 0)
    }
    return { key: g.key, name: g.name, total, thru }
  })
  return rankRows(rows)
}

function rankRows(rows) {
  rows.sort((a, b) => b.total - a.total || b.thru - a.thru)
  let pos = 0, prev = null
  rows.forEach((r, i) => {
    if (r.total !== prev) { pos = i + 1; prev = r.total }
    r.pos = pos
    r.tied = rows.filter(x => x.total === r.total).length > 1
  })
  return rows
}

/**
 * Four-ball v four-ball match play (two groups): each hole goes to the group with the lowest net
 * score, shots off the lowest handicap across both groups. Counts holes both groups have played.
 */
export function groupBestBall(holes, [ga, gb], allow) {
  const all = [...ga.players, ...gb.players]
  const ph = playingHandicaps(all.map(p => p.courseHcp), allow, true)
  const phA = ph.slice(0, ga.players.length), phB = ph.slice(ga.players.length)
  const thru = Math.min(groupThru(ga.players), groupThru(gb.players))
  const best = (players, phs, i) => Math.min(...players.map((p, k) => p.gross[i] - shotsOnHole(phs[k], holes[i].si)))
  const winners = []
  for (let i = 0; i < thru; i++) winners.push(Math.sign(best(gb.players, phB, i) - best(ga.players, phA, i)))
  return { ...matchProgress(winners), ahead: { A: groupThru(ga.players), B: groupThru(gb.players) } }
}

/**
 * Ryder Cup: in every four-ball, team A's pair plays team B's pair at better ball.
 * format: 'bbl' (off the low), 'bbstab' (Stableford points), 'bbscr' (scratch). 1 point a match.
 */
export function ryderMatches(holes, groups, format, allow) {
  const matches = groups.map(g => {
    const a = g.players.filter(p => p.team === 'A'), b = g.players.filter(p => p.team === 'B')
    const four = [...a, ...b]
    const ph = playingHandicaps(four.map(p => p.courseHcp), format === 'bbscr' ? 0 : allow, format === 'bbl')
    const thru = groupThru(four)
    const winners = []
    for (let i = 0; i < thru; i++) winners.push(betterBallWinner(holeCalc(holes[i], four.map(p => p.gross[i]), ph), format === 'bbstab' ? 'pts' : 'net'))
    const m = matchProgress(winners)
    const res = { st: m.thru === 0 ? 'ns' : m.finished ? 'done' : 'live', d: m.diff, txt: m.text, thru: m.thru }
    return { key: g.key, name: g.name, a: a.map(p => p.name), b: b.map(p => p.name), res, match: m }
  })
  return { matches, score: teamEventScore(matches) }
}

/** Own teams: everyone's Stableford points count for their team. */
export function teamStableford(holes, groups, allow) {
  const players = groups.flatMap(g => {
    const ph = playingHandicaps(g.players.map(p => p.courseHcp), allow)
    const thru = groupThru(g.players)
    return g.players.map((p, k) => {
      let pts = 0
      for (let i = 0; i < thru; i++) pts += points(holes[i], p.gross[i], ph[k])
      return { id: p.id, name: p.name, team: p.team, group: g.name, pts, thru }
    })
  })
  const totals = { A: 0, B: 0 }
  players.forEach(p => (totals[p.team] += p.pts))
  players.sort((x, y) => y.pts - x.pts)
  return { totals, players }
}

/** Score any player event. Returns { kind: 'table' | 'match' | 'ryder' | 'teams', ... }. */
export function scorePlayerEvent({ style, format }, holes, groups, allow) {
  if (style === 'fourball' && format === 'bestball') return { kind: 'match', ...groupBestBall(holes, groups, allow) }
  if (style === 'fourball') return { kind: 'table', rows: groupStableford(holes, groups, allow, format === 'best2' ? 2 : Infinity) }
  if (style === 'ryder') return { kind: 'ryder', ...ryderMatches(holes, groups, format, allow) }
  return { kind: 'teams', ...teamStableford(holes, groups, allow) }
}
