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

/* ---------- Events set up in advance ---------- */

/** A member's gross scores on a day, from whichever card they're on (saved holes only). */
export function grossOnDay(rounds, memberId, holes) {
  const r = [...rounds].reverse().find(x => x.lineup.some(e => e.m === memberId)) // latest card wins
  if (!r) return holes.map(() => null)
  const k = r.lineup.findIndex(e => e.m === memberId)
  return holes.map((_, i) => (r.done[i] ? r.scores[i][k] : null))
}

/**
 * Score an event set up in advance.
 *   event:    { style: 'ryder'|'teams'|'individual', fmt, days, players: [ids], team: { id: 'A'|'B' }, matches: { day: [{ a, b }] } }
 *   dayCards: { [day]: rounds on that day }       player(id) → { name, courseHcp }
 *   allow:    handicap allowance (fraction)
 */
export function scoreAdvanceEvent(event, holes, dayCards, player, allow) {
  const days = Array.from({ length: event.days }, (_, i) => i + 1)
  const P = (id, team, d) => ({ id, name: player(id).name, team, courseHcp: player(id).courseHcp, gross: grossOnDay(dayCards[d] ?? [], id, holes) })

  if (event.style === 'ryder') {
    const byDay = {}
    for (const d of days) {
      const groups = (event.matches[d] ?? []).map((m, i) => ({
        key: `${d}-${i}`, name: `Match ${i + 1}`,
        players: [...m.a.map(id => P(id, 'A', d)), ...m.b.map(id => P(id, 'B', d))],
      }))
      byDay[d] = ryderMatches(holes, groups, event.fmt, allow).matches
    }
    return { kind: 'ryder', byDay, score: teamEventScore(Object.values(byDay).flat()) }
  }

  // Per player, per day: points (or net to par) over the holes they've saved.
  const rows = event.players.map(id => {
    const perDay = days.map(d => {
      const p = P(id, event.team[id], d), thru = groupThru([p])
      const ph = playingHandicaps([p.courseHcp], allow)[0]
      let pts = 0, net = 0
      for (let i = 0; i < thru; i++) {
        const sh = shotsOnHole(ph, holes[i].si)
        pts += stablefordPoints(p.gross[i], holes[i].par, sh)
        net += p.gross[i] - sh - holes[i].par
      }
      return { thru, pts, net }
    })
    return { id, name: player(id).name, team: event.team[id], perDay, pts: perDay.reduce((t, x) => t + x.pts, 0), net: perDay.reduce((t, x) => t + x.net, 0) }
  })

  if (event.style === 'teams') {
    const totals = { A: 0, B: 0 }
    rows.forEach(r => (totals[r.team] += r.pts))
    return { kind: 'teams', totals, players: rows.sort((a, b) => b.pts - a.pts) }
  }
  // Individual: Stableford highest first, net lowest first; players who haven't started go last.
  const started = r => r.perDay.some(x => x.thru)
  const key = r => (event.fmt === 'net' ? r.net : -r.pts)
  rows.sort((a, b) => started(b) - started(a) || key(a) - key(b))
  let pos = 0, prev = null
  rows.forEach((r, i) => {
    if (!started(r)) { r.pos = null; return }
    if (key(r) !== prev) { pos = i + 1; prev = key(r) }
    r.pos = pos
    r.tied = rows.filter(x => started(x) && key(x) === key(r)).length > 1
  })
  return { kind: 'individual', rows }
}

/* ---------- Leagues ---------- */

/**
 * A league over several weeks: each week a team scores the sum of its best `best_of` entered
 * Stableford rounds; the season is the total of the weeks. Rounds count live, hole by hole.
 *   event:   { weeks, bestOf, teams: [{ name, col }], team: { memberId: teamIndex } }
 *   entries: [{ week, memberId, roundId }]      cards: { [roundId]: { lineup, scores, done } }
 *   player(id) → { name, courseHcp }            allow: Stableford allowance (fraction)
 */
export function scoreLeague(event, holes, entries, cards, player, allow) {
  const rounds = entries.map(en => {
    const card = cards[en.roundId]
    const k = card ? card.lineup.findIndex(x => x.m === en.memberId) : -1
    const gross = holes.map((_, i) => (k >= 0 && card.done[i] ? card.scores[i][k] : null))
    const thru = groupThru([{ gross }])
    const ph = playingHandicaps([player(en.memberId).courseHcp], allow)[0]
    let pts = 0
    for (let i = 0; i < thru; i++) pts += stablefordPoints(gross[i], holes[i].par, shotsOnHole(ph, holes[i].si))
    return { ...en, team: event.team[en.memberId], pts, thru }
  })
  const weeks = Array.from({ length: event.weeks }, (_, i) => i + 1)
  const teams = event.teams.map((t, idx) => {
    const perWeek = weeks.map(w => {
      const mine = rounds.filter(r => r.team === idx && r.week === w).sort((a, b) => b.pts - a.pts)
      const counted = mine.slice(0, event.bestOf)
      return { week: w, score: counted.reduce((s, r) => s + r.pts, 0), entered: mine.length, counting: counted.map(r => r.memberId), live: mine.some(r => r.thru < 18) }
    })
    return { idx, name: t.name, col: t.col, perWeek, total: perWeek.reduce((s, w) => s + w.score, 0) }
  })
  rankBy(teams, t => t.total)
  const players = Object.keys(event.team).map(Number).map(id => {
    const mine = rounds.filter(r => r.memberId === id)
    return { id, name: player(id).name, team: event.team[id], total: mine.reduce((s, r) => s + r.pts, 0), rounds: mine.length, perWeek: Object.fromEntries(mine.map(r => [r.week, { pts: r.pts, thru: r.thru }])) }
  })
  rankBy(players.filter(p => p.rounds), p => p.total)
  players.sort((a, b) => (b.rounds > 0) - (a.rounds > 0) || b.total - a.total)
  return { teams: teams.sort((a, b) => a.pos - b.pos), players }
}

function rankBy(list, value) {
  const sorted = [...list].sort((a, b) => value(b) - value(a))
  let pos = 0, prev = null
  sorted.forEach((x, i) => {
    if (value(x) !== prev) { pos = i + 1; prev = value(x) }
    x.pos = pos
    x.tied = sorted.filter(y => value(y) === value(x)).length > 1
  })
}

/**
 * Draw league teams so their handicaps roughly balance, with a different draw each time.
 * Captains (captains[k] = member id or null) stay on their own team. Everyone else is sorted by
 * handicap index with a little random jitter, then dealt a band at a time: each band's lowest
 * index goes to the team whose projected average (empty places counted at the average of the
 * players still to deal) is currently highest. Finally, players (never captains) are swapped
 * between the highest- and lowest-average teams while that narrows the gap. Full teams are skipped; anyone left when every team is full stays off.
 * Returns { [playerId]: teamIndex }.
 */
export function drawTeams(ids, indexOf, nTeams, sizes, captains = [], rand = Math.random, jitter = 3) {
  const cap = k => (Array.isArray(sizes) ? sizes[k] : sizes) ?? Infinity
  const out = {}, sum = Array(nTeams).fill(0), count = Array(nTeams).fill(0)
  const put = (id, k) => { out[id] = k; sum[k] += indexOf(id); count[k]++ }
  captains.forEach((id, k) => { if (id != null && k < nTeams && ids.includes(id) && count[k] < cap(k)) put(id, k) })
  const rest = ids.filter(id => out[id] == null).map(id => ({ id, key: indexOf(id) + rand() * jitter })).sort((a, b) => a.key - b.key)
  // Where a team is heading: its players so far, with its empty places filled at the average of
  // the players still to deal who'll get a place (the highest handicaps beyond the places stay off).
  let pool = 0
  const avg = k => (Number.isFinite(cap(k)) ? (sum[k] + (cap(k) - count[k]) * pool) / cap(k) : count[k] ? sum[k] / count[k] : pool)
  while (rest.length) {
    const open = Array.from({ length: nTeams }, (_, k) => k).filter(k => count[k] < cap(k))
    if (!open.length) break
    const places = open.reduce((t, k) => t + cap(k) - count[k], 0), placeable = rest.slice(0, places)
    pool = placeable.reduce((t, x) => t + indexOf(x.id), 0) / placeable.length
    const band = rest.splice(0, open.length).sort((a, b) => indexOf(a.id) - indexOf(b.id))
    const needy = [...open].sort((a, b) => avg(b) - avg(a) || count[a] - count[b] || a - b)
    band.forEach((x, n) => put(x.id, needy[n]))
  }
  // Then even out what's left: swap a non-captain between the highest- and lowest-average teams
  // while that brings them closer together.
  const capt = new Set(captains.filter(id => id != null))
  const mean = k => sum[k] / count[k]
  for (let guard = 0; guard < 500; guard++) {
    const ks = Array.from({ length: nTeams }, (_, k) => k).filter(k => count[k])
    if (ks.length < 2) break
    const hi = ks.reduce((a, b) => (mean(b) > mean(a) ? b : a)), lo = ks.reduce((a, b) => (mean(b) < mean(a) ? b : a))
    const gap = mean(hi) - mean(lo)
    let best = null
    for (const a of Object.keys(out)) {
      if (out[a] !== hi || capt.has(+a)) continue
      for (const b of Object.keys(out)) {
        if (out[b] !== lo || capt.has(+b)) continue
        const d = indexOf(+a) - indexOf(+b)
        const g = Math.abs((sum[hi] - d) / count[hi] - (sum[lo] + d) / count[lo])
        if (g < gap - 0.01 && (!best || g < best.g)) best = { a, b, d, g }
      }
    }
    if (!best) break
    out[best.a] = lo; out[best.b] = hi; sum[hi] -= best.d; sum[lo] += best.d
  }
  return out
}

/**
 * Captains drawn at random from the candidates: [memberId | null] for each team. Only entrants count,
 * each once; candidates beyond the number of teams aren't picked (they play as ordinary entrants), and
 * with too few candidates the last teams get none.
 */
export function drawCaptains(pool, players, nTeams, rand = Math.random) {
  const left = [...new Set(pool)].filter(id => players.includes(id))
  for (let i = left.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [left[i], left[j]] = [left[j], left[i]] }
  return Array.from({ length: nTeams }, (_, k) => left[k] ?? null)
}
