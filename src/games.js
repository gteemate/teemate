// The game catalogue. Definitions (rules, defaults) live in code; the club's choices
// (which games are on, allowance changes, preferred game per group size) come from api.getGameSettings().

// pct: default handicap allowance; null = scratch, nothing to edit. play: how the 4-ball scorecard scores it.
export const GAME_DEFS = {
  2: { title: '2 golfers', games: [
    { k: 'sm2', name: 'Stableford match play', sub: 'Off the low man', pct: 85, desc: 'More Stableford points on a hole wins it.', play: { kind: 'match1', cmp: 'pts', offLow: true } },
    { k: 'st2', name: 'Stableford total', sub: 'Stableford', pct: 100, desc: 'Higher Stableford total over 18 wins.', play: { kind: 'stab' } },
    { k: 'sc2', name: 'Scratch match play', sub: 'No shots', pct: null, desc: 'Lower gross score wins each hole. No shots.', play: { kind: 'match1', cmp: 'net' } },
    { k: 'kos', name: 'Handicap match play', sub: 'Full difference', pct: 100, desc: 'Lower net score wins each hole, shots off the low handicap at the full difference. How club knockouts are played.', play: { kind: 'match1', cmp: 'net', offLow: true } }] },
  3: { title: '3 golfers', games: [
    { k: 'six', name: 'Six pointer (Stableford)', sub: 'Stableford', pct: 100, desc: '4 / 2 / 0 a hole by Stableford points.', play: { kind: 'six', cmp: 'pts' } },
    { k: 'sixs', name: 'Six pointer (scratch)', sub: 'No shots', pct: null, desc: '4 / 2 / 0 a hole by gross score. No shots.', play: { kind: 'six', cmp: 'net' } },
    { k: 'nine', name: '9 points (Stableford)', sub: 'Stableford', pct: 100, desc: '5 / 3 / 1 a hole by Stableford points.', play: { kind: 'six', cmp: 'pts', split: [5, 3, 1] } },
    { k: 'nines', name: '9 points (scratch)', sub: 'No shots', pct: null, desc: '5 / 3 / 1 a hole by gross score. No shots.', play: { kind: 'six', cmp: 'net', split: [5, 3, 1] } },
    { k: 'wolf', name: 'Wolf (Stableford)', sub: 'Full handicaps', pct: 100, desc: 'Rotating tee order; the wolf goes solo or partners. Lone win 2, pair win 1 each.' },
    { k: 'wolfs', name: 'Wolf (scratch)', sub: 'No shots', pct: null, desc: 'Same game on gross scores. No shots.' },
    { k: 'tvt', name: '2 v 1 Stableford · better total', sub: 'Stableford', pct: 100, desc: "The single's own Stableford total against the better of the pair's own totals." },
    { k: 'tvb', name: '2 v 1 Stableford · better ball', sub: 'Stableford', pct: 100, desc: "The single's Stableford total against the pair's best score on each hole, added up." },
    { k: 'tvm', name: '2 v 1 Stableford match play', sub: 'Stableford', pct: 100, desc: "Hole by hole: the single's points against the pair's best." },
    { k: 'tvs', name: '2 v 1 scratch match play', sub: 'No shots', pct: null, desc: "Hole by hole: the single's gross against the pair's best. No shots." }] },
  4: { title: '4 golfers', games: [
    { k: 'bbl', name: 'Better ball · off the low', sub: 'Allowance', pct: 90, desc: 'Match play, shots off the lowest handicap.', play: { kind: 'match', cmp: 'net', pairs: true, offLow: true } },
    { k: 'bbstab', name: 'Better ball · Stableford', sub: 'Full handicaps', pct: 100, desc: 'Most Stableford points wins the hole.', play: { kind: 'match', cmp: 'pts', pairs: true } },
    { k: 'bbscr', name: 'Better ball · scratch', sub: 'No shots', pct: null, desc: 'No shots, lowest score wins the hole.', play: { kind: 'match', cmp: 'net', pairs: true } },
    { k: 'scram', name: '2-man scramble', sub: '35% low · 15% high', pct: null, desc: 'One ball per pair, team handicap from both players.' },
    { k: 'stab', name: 'Individual Stableford', sub: 'Stableford', pct: 95, desc: 'Everyone for themselves, points per hole.', play: { kind: 'stab' } },
    { k: 'skins', name: 'Skins', sub: 'Off the low', pct: 100, desc: 'Lowest net wins the hole. Ties carry over.', play: { kind: 'skins', offLow: true } },
    { k: 'stroke', name: 'Net strokeplay', sub: 'Allowance', pct: 95, desc: 'Total net score against par.', play: { kind: 'stroke' } }] },
}

// Player events: one group challenges another.
export const EVENT_STYLES = {
  fourball: { name: 'Four-ball v four-ball', desc: 'Each group is a team. No picking needed.' },
  ryder: { name: 'Ryder Cup', desc: 'Two teams, two from each team in every four-ball. Each four-ball plays a better-ball match for a point.' },
  teams: { name: 'Your own teams', desc: 'Split everyone into two equal teams however you like.' },
}
export const EVENT_FORMATS = {
  fourball: [
    { k: 'best2', name: 'Best 2 Stableford per hole', desc: 'Each group’s two best Stableford scores on every hole count.' },
    { k: 'all4', name: 'All 4 Stableford', desc: 'Every player’s Stableford points count.' },
    { k: 'bestball', name: 'Match play · best ball', desc: 'Each hole goes to the group with the lowest net score.' },
  ],
  ryder: [
    { k: 'bbl', name: 'Better ball · off the low', desc: 'Match play, shots off the lowest handicap. 1 point a match.' },
    { k: 'bbstab', name: 'Better ball · Stableford', desc: 'Most Stableford points wins each hole. 1 point a match.' },
    { k: 'bbscr', name: 'Better ball · scratch', desc: 'No shots. 1 point a match.' },
  ],
  teams: [
    { k: 'teamstab', name: 'Team Stableford', desc: 'Everyone’s Stableford points count for their team.' },
  ],
}
// Which club game setting supplies the handicap allowance for each event format.
export const EVENT_ALLOWANCE_GAME = { best2: 'stab', all4: 'stab', teamstab: 'stab', stab: 'stab', net: 'stroke', bestball: 'bbl', bbl: 'bbl', bbstab: 'bbstab', bbscr: 'bbscr' }
export const eventFormatName = k => Object.values(EVENT_FORMATS).flat().find(f => f.k === k)?.name ?? k

// Better-ball pairings as player indexes [a1, a2, b1, b2]; player 0 is always "you".
export const PAIRINGS = [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2]]

/** Merge the club's settings into the definitions. */
export function buildLibrary({ settings, pref, mine = {} }) {
  const sections = {}, lib = {}
  for (const [n, s] of Object.entries(GAME_DEFS)) {
    sections[n] = { title: s.title, games: s.games.map(def => {
      const st = settings[def.k] || {}
      const x = { ...def, on: st.on ?? true, pct: def.pct == null ? null : st.pct ?? def.pct }
      lib[def.k] = x
      return x
    }) }
  }
  return { sections, lib, pref, mine }
}

// Games that can be scored on a card of n players: that group size's own games, plus the
// individual 4-ball games (Stableford, skins, strokeplay) for smaller groups.
export function playable(L, n = 4) {
  const own = (L.sections[n]?.games ?? []).filter(x => x.play && x.on)
  if (n === 4) return own
  const extra = L.sections[4].games.filter(x => x.play && x.on && !x.play.pairs && !own.some(o => o.play.kind === x.play.kind))
  return [...own, ...extra]
}
export const gameSpec = x => ({ ...x.play, allow: x.pct == null ? 0 : x.pct / 100 })

/** The game to use on a card of n players: the chosen one if it's playable, else my preferred
 *  game for that group size, else the club's, else the first playable. */
export function resolveGame(L, k, n = 4) {
  const ok = x => x && playable(L, n).includes(x)
  if (ok(L.lib[k])) return k
  for (const p of [L.mine?.[n], L.pref[n]]) if (ok(L.lib[p])) return p
  return playable(L, n)[0]?.k
}

/** My preferred game for a group size (falls back to the club's). */
export const preferredGame = (L, n) => resolveGame(L, null, n)

/** Slope, rating and par for course-handicap maths. */
export function teeRating(course, key = 'white') {
  const t = course.tees.find(x => x.key === key)
  return { slope: t.slope, rating: t.rating, par: course.holes.reduce((s, h) => s + h.par, 0) }
}

/* ---------- A card's game: scores only, a game for the group, or a one-on-one within the card ---------- */

/** A new card starts with no game: scores only (everyone's own Stableford and net, at full handicap). */
export const NO_GAME = 'none'
export const SCORES_ONLY = { kind: 'stab', allow: 1, offLow: false }
const token = x => (x.m != null ? `m${x.m}` : `g${x.g}`)
const fromToken = t => (t[0] === 'm' ? { m: +t.slice(1) } : { g: +t.slice(1) })
/** A one-on-one match between two players on the card: 'kos:m0:m12' (handicap match play, member 0 v member 12). */
export const oneOnOneKey = (base, a, b) => `${base}:${token(a)}:${token(b)}`
/** → { base, pair: [a, b] | null } from a card's game key. */
export function parseGame(key) {
  const [base, a, b] = String(key ?? NO_GAME).split(':')
  return { base, pair: a && b ? [fromToken(a), fromToken(b)] : null }
}
/** The games a one-on-one can be: the two-player match play games. */
export const oneOnOneGames = L => L.sections[2].games.filter(x => x.on && x.play?.kind === 'match1')
/** How a card's game is scored (for the round pill etc.): scores only, the game, or the one-on-one's game. */
export function cardSpec(L, key, n) {
  const { base, pair } = parseGame(key)
  if (base === NO_GAME) return SCORES_ONLY
  return gameSpec(L.lib[pair ? base : resolveGame(L, base, n)] ?? L.lib[resolveGame(L, null, n)])
}
/** The game's name: 'Scores only', 'Better ball · off the low', or 'Handicap match play'. */
export const gameName = (L, key) => { const { base } = parseGame(key); return base === NO_GAME ? 'Scores only' : L.lib[base]?.name ?? 'Game' }
