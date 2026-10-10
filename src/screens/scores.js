// Scores tab: hole-by-hole scorecard for the group, with the game drop-down and pairings.
import * as api from '../api.js'
import { S } from '../state.js'
import { forceAlertCheck } from '../alert-bar.js'
import { $, esc, ini, sur, header, keepScroll, top0, render, toast, fmtHcp } from '../ui.js'
import { today, hhmm, isoDate, eventLastDay } from '../dates.js'
import { banners, bindBanners, pendingInvite, invitePopup } from './player-events.js'
import { leagueBadges, bindLeagueBox } from './scores-league.js'
import { roundBoard } from '../round.js'
import { guestHcpSheet } from './scores-guest.js'
import { holeGrid } from '../course-art.js'
import { courseHandicap, playingHandicaps, holeCalc, gameState, upText, toPar } from '../scoring.js'
import { buildLibrary, playable, gameSpec, resolveGame, preferredGame, teeRating, PAIRINGS, NO_GAME, SCORES_ONLY, parseGame, oneOnOneKey, oneOnOneGames, gameName } from '../games.js'

// The round is kept here between redraws so unsaved stepper changes survive; api.saveRound() persists it.
// round.lineup: the card's players in order, each { m: memberId } or { g: guestId }; the first is you
// (a card someone else started comes in your view of it, see card-view.js).
let round

export const newRound = (course, lineup, game, slotId = null) => ({
  lineup, slotId, game, pairing: 0, submitted: {},
  scores: course.holes.map(h => lineup.map(() => h.par)),
  done: course.holes.map(() => false),
})
export const played = r => { const i = r.done.findIndex(d => !d); return i === -1 ? r.done.length : i }

/** A card's line-up from a tee time: me first, then everyone else on it (members and guests). */
export function lineupFromTeeTime(slot, meId) {
  const others = slot.players.filter(p => p.memberId !== meId).slice(0, 3)
  return [{ m: meId }, ...others.map(p => (p.guest ? { g: p.id } : { m: p.memberId }))]
}

export async function load() {
  const [course, members, games, me, teeTimes, events, allEvents] = await Promise.all([api.getCourse(), api.getMembers(), api.getGameSettings(), api.getMe(), api.getMyTeeTimes(today()), api.getMyPlayerEvents(), api.getEvents()])
  round = !round ? await api.getCurrentRound() : round.id ? await latest(round) : round
  const guests = round ? await api.getGuests(round.lineup.filter(e => e.g != null).map(e => e.g)) : []
  // Leagues running this week that someone on this card plays in.
  const t = isoDate(today())
  const leagues = round ? allEvents.filter(e => e.style === 'league' && e.startDate <= t && eventLastDay(e) >= t && round.lineup.some(x => e.players.includes(x.m))) : []
  const entries = await api.getLeagueEntries(leagues.map(e => e.id))
  // The round's Leaderboard tab: the competition this card counts for (none for a general round).
  const onToday = round ? allEvents.filter(e => e.style !== 'league' && e.startDate <= t && eventLastDay(e) >= t && round.lineup.some(x => e.players.includes(x.m))) : []
  const eventEntries = round?.id ? await api.getEventEntries(onToday.map(e => e.id)) : []
  S.roundBoard = round?.id ? roundBoard({ cardId: round.id, lineup: round.lineup, events: allEvents, leagueEntries: entries, eventEntries, playerEvents: events, date: t }) : null
  return { course, members, guests, L: buildLibrary(games), me, teeTimes, events, leagues, entries }
}

// The card is shared by everyone on it, so pick up holes, game or pairs someone else has saved.
// Scores I've typed in and not saved yet stay as they are.
async function latest(mine) {
  const fresh = await api.getRound(mine.id)
  if (!fresh) { S.ch = null; return api.getCurrentRound() } // deleted by whoever started it
  if (fresh.updatedAt === mine.updatedAt) return mine
  if (JSON.stringify(fresh.lineup) !== JSON.stringify(mine.lineup)) return fresh
  // Someone has changed a score I typed in: flag it for a second look
  const meId = mine.lineup[0].m
  fresh.checks = mine.checks ?? []
  fresh.scores.forEach((row, i) => row.forEach((v, k) => {
    const by = fresh.entered?.[i]?.[k]
    if (mine.done[i] && mine.entered?.[i]?.[k] === meId && by != null && by !== meId && v !== mine.scores[i][k]) fresh.checks.push({ i, k, mine: mine.scores[i][k], theirs: v, by, kept: v })
  }))
  // Keep what I've typed in and not saved yet
  fresh.changed = mine.changed ?? new Set()
  for (const c of fresh.changed) {
    const [i, k] = c.split(':').map(Number)
    fresh.scores[i][k] = mine.scores[i][k]
    ;(fresh.entered ??= fresh.scores.map(r => r.map(() => null)))[i][k] = mine.entered[i][k]
  }
  return fresh
}

// Player event banners go at the top of the Scores tab; the "play an event" link at the bottom.
const eventsTop = (events, me) => banners(events, me)
function eventsBottom(events, card = false) {
  const busy = events.some(e => e.status === 'pending' || e.status === 'accepted')
  if (busy) return ''
  // On New round it's an invitation worth noticing; on the scorecard, a quiet link (scoring comes first there).
  return card ? `<button class="card pecard" id="pe-new">
      <span class="pe-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 4 4M17 6h3a3 3 0 0 1-4 4M12 14v4M8 21h8"/></svg></span>
      <span class="pe-tx"><b>Play a match against other groups</b><small>Challenge another four-ball on today’s tee sheet: four-ball team match play, better ball or team Stableford</small></span>
      <span class="chev" aria-hidden="true">›</span></button>`
    : '<button class="linkbtn" id="pe-new" style="align-self:flex-start">+ Play an event with other groups</button>'
}
function bindEvents(events, me) {
  bindBanners(events, me)
  const nb = $('pe-new')
  if (nb) nb.onclick = async () => { S.sview = 'challenge'; await render(); top0() }
  invitePopup(pendingInvite(events, me), me)
}

/** Forget the card held in memory so the next visit reloads it (e.g. after a booking is deleted). */
export function resetRound() {
  round = undefined
  S.ch = null
  S.gmenu = false
}

export function setRound(r) {
  round = r
  S.ch = 0
}

const CHEV = '<svg class="cv" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'

export function draw({ course, members, guests, L, me, teeTimes, events, leagues, entries }) {
  if (!round) { startScreen({ course, L, me, teeTimes, events }); return bindEvents(events, me) }
  // Players on the card. A guest without a handicap plays off 0 until someone sets it.
  const ps = round.lineup.map(e => {
    if (e.m != null) { const m = members.find(x => x.id === e.m); return { name: m.name, hcp: m.hcp, guestId: null } }
    const gst = guests.find(x => x.id === e.g)
    return { name: gst?.name ?? 'Guest', hcp: gst?.hcp ?? null, guestId: e.g }
  })
  const n = ps.length
  // The card's game: scores only (a new card), a game for the group, or a one-on-one between two players on it.
  const { base, pair } = parseGame(round.game)
  if (base !== NO_GAME && !pair) round.game = resolveGame(L, round.game, n)
  const same = (x, y) => (x.m != null ? x.m === y.m : x.g === y.g)
  const duo = pair ? pair.map(x => round.lineup.findIndex(e => same(e, x))) : null
  const one = !!duo && duo.every(k => k >= 0) // (a one-on-one whose player has left the card is scores only)
  const LG = base === NO_GAME || (pair && !one) ? null : L.lib[pair ? base : round.game]
  S.ch ??= Math.min(played(round), 17)
  const o = PAIRINGS[round.pairing], G = LG ? gameSpec(LG) : SCORES_ONLY, g = G.kind
  const chs = ps.map(p => courseHandicap(p.hcp ?? 0, teeRating(course)))
  let ph = playingHandicaps(chs, G.allow, G.offLow)
  if (one) { const two = playingHandicaps(duo.map(k => chs[k]), G.allow, G.offLow); ph = ps.map((_, k) => (duo.includes(k) ? two[duo.indexOf(k)] : chs[k])) } // shots off the lower of the two
  // The game's state after `upTo` holes: a one-on-one is scored between its two players only.
  const stateAt = upTo => (one ? gameState(G, course.holes, duo.map(k => ph[k]), round.scores.map(r => duo.map(k => r[k])), upTo) : gameState(G, course.holes, ph, round.scores, upTo, o))
  const noHcp = ps.filter(p => p.guestId && p.hcp == null)
  const i = S.ch, h = course.holes[i], P = played(round)
  const c = holeCalc(h, round.scores[i], ph, o), gs = stateAt(P)
  const pts = G.cmp === 'pts' || g === 'stab'
  const pairName = s => (s === 'A' ? [o[0], o[1]] : [o[2], o[3]]).map(k => sur(ps[k].name)).join(' / ')

  header(`Hole ${h.n}`, `Par ${h.par} · SI ${h.si} · ${h.yards.white} yds`)

  // Result under each hole number in the grid.
  const cellText = j => {
    const r = gs.holes[j]
    if (!r) return { cls: '', t: '–' }
    if (g === 'match' || g === 'match1') return { cls: r.diff > 0 ? 'A' : r.diff < 0 ? 'B' : '', t: upText(r.diff) }
    if (g === 'stab' || g === 'six') return { cls: '', t: r.pts }
    if (g === 'skins') return r.winner < 0 ? { cls: '', t: 'c/o' } : { cls: r.winner === 0 ? 'A' : '', t: ini(ps[r.winner].name) }
    return { cls: r.toPar < 0 ? 'A' : r.toPar > 0 ? 'B' : '', t: toPar(r.toPar) }
  }
  const grid = holeGrid(i, j => { const r = cellText(j); return `<span class="res ${r.cls}">${r.t}</span>` }, 'data-j')

  const gamebar = S.gmenu ? `<div class="card gmenu" id="gmenu">
    ${G.pairs ? `<div class="gm-sec"><span class="gm-lbl">Pairs</span><div class="games" role="radiogroup" aria-label="Pairs">${PAIRINGS.map((pp, n) => `<button class="gamecard sm" role="radio" aria-checked="${round.pairing === n}" data-pr="${n}"><span class="radio"></span><span class="who"><strong>You & ${esc(ps[pp[1]].name)}</strong><small>v ${esc(ps[pp[2]].name)} & ${esc(ps[pp[3]].name)}</small></span></button>`).join('')}</div></div>` : ''}
    <div class="gm-sec"><span class="gm-lbl">Players and shots</span><div class="gm-players">${ps.map((p, k) => `<div><span>${esc(p.name)}${k === 0 ? ' (you)' : ''}${p.guestId ? ` · guest · ${p.hcp == null ? '<button class="linkbtn" data-gh="' + k + '">set handicap</button>' : `index ${fmtHcp(p.hcp)} <button class="linkbtn" data-gh="${k}">change</button>`}` : ''}</span><b>${ph[k]}</b></div>`).join('')}</div>
      <span class="hint">${G.offLow ? 'Shots off the lowest playing handicap.' : G.allow ? `Playing handicap at ${Math.round(G.allow * 100)}% of course handicap.` : 'Scratch: no shots.'} Course handicaps from the white tees (${teeRating(course).rating} / ${teeRating(course).slope}).</span></div>
    <div class="gm-btns"><button class="ghost" id="chg">Change players</button><button class="primary" id="gdone">Done</button></div></div>` : ''

  const sideA = k => o.indexOf(k) < 2
  const best = k => {
    if (one) { if (!duo.includes(k)) return false; const v = duo.map(j => (G.cmp === 'pts' ? c.pts[j] : -c.net[j])); return (G.cmp === 'pts' ? c.pts[k] : -c.net[k]) === Math.max(...v) }
    if (g === 'match') return G.cmp === 'pts' ? c.pts[k] === (sideA(k) ? c.pA : c.pB) : c.net[k] === (sideA(k) ? c.nA : c.nB)
    if (g === 'stab' || pts) return c.pts[k] === Math.max(...c.pts)
    return c.net[k] === Math.min(...c.net)
  }
  const card = k => {
    const p = ps[k], gr = round.scores[i][k], sh = c.sh[k]
    const hc = p.guestId ? (p.hcp == null ? `<button class="sethcp" data-gh="${k}">Set handicap</button>` : `<button class="linkbtn h" data-gh="${k}" aria-label="Change ${esc(p.name)}'s handicap">(${ph[k]})</button>`) : `<span class="h">(${ph[k]})</span>`
    return `<div class="pcard${best(k) ? ' counts' : ''}"><span class="av${p.guestId ? ' gst' : ''}">${ini(p.name)}</span><span class="who"><strong>${esc(p.name)} ${hc}</strong>
      <span class="pills">${sh ? `<span class="pill">${sh} shot${sh > 1 ? 's' : ''}</span>` : ''}<span class="pill">${pts ? `${c.pts[k]} pts` : G.allow ? `net ${c.net[k]}` : `gross ${gr}`}</span>${leagueBadges(round, round.lineup[k]?.m, leagues, entries)}</span></span>
      <span class="stepper"><button data-k="${k}" data-d="-1" aria-label="One fewer for ${esc(p.name)}">−</button><output class="${round.done[i] ? '' : 'draft'}">${gr}</output><button data-k="${k}" data-d="1" aria-label="One more for ${esc(p.name)}">+</button></span></div>`
  }

  const sideLbl = s => (G.cmp === 'pts' ? `${s === 'A' ? c.pA : c.pB} pts` : `best ${G.allow ? 'net' : 'score'} ${s === 'A' ? c.nA : c.nB}`)
  const body = G.pairs
    ? `<div class="sidehead"><b>You & ${esc(sur(ps[o[1]].name))}</b><span>${sideLbl('A')}</span></div>${card(o[0])}${card(o[1])}
       <div class="sidehead"><b>${esc(pairName('B')).replace(' / ', ' &amp; ')}</b><span>${sideLbl('B')}</span></div>${card(o[2])}${card(o[3])}`
    : ps.map((_, k) => card(k)).join('')

  const pn = k => (k === 0 ? 'You' : sur(ps[k].name)) // a player on the card, as the status line names them
  let line
  if (!gs.thru) line = 'Not started'
  else if (one) {
    const m = gs.match, who = m.lead === 'A' ? pn(duo[0]) : m.lead === 'B' ? pn(duo[1]) : null
    line = (who ? `${who} ${m.over ? `win${who === 'You' ? '' : 's'} ${m.text}` : m.text}` : m.text) + (m.finished ? '' : ` thru ${m.thru}`)
  }
  else if (g === 'match') {
    const m = gs.match
    line = (m.lead ? `${pairName(m.lead)} ${m.over ? `win ${m.text}` : m.text}` : m.text) + (m.finished ? '' : ` thru ${m.thru}`)
  } else if (g === 'match1') {
    const m = gs.match, who = m.lead === 'A' ? 'You' : m.lead === 'B' ? sur(ps[1].name) : null
    line = (who ? `${who} ${m.over ? `win${who === 'You' ? '' : 's'} ${m.text}` : m.text}` : m.text) + (m.finished ? '' : ` thru ${m.thru}`)
  } else {
    const v = gs.totals[0]
    line = g === 'stab' || g === 'six' ? `You: ${v} pts thru ${gs.thru}` : g === 'skins' ? `You: ${v} skin${v === 1 ? '' : 's'} · ${gs.carry} carrying` : `You: ${toPar(v)} net thru ${gs.thru}`
  }

  const fin = gs.finished && round.done[i]
  // Two people typed different scores for the same player: ask for a second look.
  const nm = id => members.find(m => m.id === id)?.name ?? 'Someone'
  const checks = (round.checks ?? []).map((c, n) => {
    const who = k => (round.lineup[k].m === me.id ? 'you' : esc(ps[k].name))
    const byTxt = c.by === round.lineup[c.k].m ? `${esc(nm(c.by))} put ${c.theirs} (own score)` : `${esc(nm(c.by))} put ${c.theirs}`
    return `<div class="hcpnote checknote"><b>Check hole ${c.i + 1}, ${who(c.k) === 'you' ? 'your score' : who(c.k)}:</b> you put ${c.mine}, ${byTxt}. The card has ${c.kept}.
      <span class="row"><button class="linkbtn" data-chk-go="${n}">Go to hole ${c.i + 1}</button><button class="linkbtn" data-chk-ok="${n}">OK, it's right</button></span></div>`
  }).join('')
  const hcpNote = noHcp.length ? `<div class="hcpnote">${noHcp.map(p => esc(p.name.split(' ')[0])).join(' and ')} ${noHcp.length > 1 ? 'have' : 'has'} no handicap yet, so ${noHcp.length > 1 ? 'they play' : 'plays'} off an index of 0 until you set one. Shots and points update as soon as you do.</div>` : ''
  $('main').innerHTML = `<div class="screen">${eventsTop(events, me)}${grid}${checks}${hcpNote}
    <div class="rstatus">${LG ? `<b>${esc(line)}</b> · <button class="gname" id="gname" aria-haspopup="dialog">${one ? `${esc(pn(duo[0]))} v ${esc(pn(duo[1]))} · ` : ''}${esc(LG.name)} ${CHEV}</button>` : '<button class="addmatch" id="gname" aria-haspopup="dialog">+ Add a match</button>'}
      <button class="linkbtn gchip" id="gchip" aria-expanded="${!!S.gmenu}" aria-controls="gmenu">${G.pairs ? 'Pairs, players &amp; shots' : 'Players &amp; shots'} ${S.gmenu ? '▴' : '›'}</button></div>
    ${gamebar}
    ${body}
    <span class="hint">${round.done[i] ? 'Saved' : 'Gross scores. Shots applied automatically.'}</span>
    ${!G.pairs && g !== 'match1' && gs.thru ? `<h3>Standings</h3>${standings(ps, gs, g)}` : ''}
    ${round.id ? '<button class="ghost accremove" id="delcard">Delete scorecard</button>' : ''}
  </div>
  <div class="cta">${fin
    ? round.submitted[round.game] ? '<button class="primary" id="newr">Start a new round</button>' : '<button class="primary" id="submit">Finish round</button>'
    : `<button class="ghost" id="prevh" ${i === 0 ? 'disabled' : ''}>‹</button><button class="primary" id="save">${round.done[i] ? 'Next hole' : `Save hole ${i + 1}`}</button>`}</div>`

  // Game menu
  $('gchip').onclick = async () => { S.gmenu = !S.gmenu; await keepScroll(render) }
  $('gname').onclick = () => matchSheet({ L, n, ps })
  if (S.gmenu) {
    document.querySelectorAll('[data-gm]').forEach(b => (b.onclick = async () => { round.game = b.dataset.gm; await api.saveRound(round); keepScroll(render) }))
    document.querySelectorAll('[data-pr]').forEach(b => (b.onclick = async () => {
      const n = +b.dataset.pr
      if (n !== round.pairing && P) toast('Pairs changed. Results recalculated')
      round.pairing = n
      await api.saveRound(round)
      keepScroll(render)
    }))
    $('chg').onclick = async () => { S.gmenu = false; S.pickTmp = round.lineup.slice(1).filter(e => e.m != null).map(e => e.m); S.sview = 'players'; await render(); top0() }
    $('gdone').onclick = () => { S.gmenu = false; render() }
  }
  // Delete the scorecard (anyone on it). The booking stays.
  if ($('delcard')) $('delcard').onclick = async () => {
    const b = $('delcard')
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = P ? `Tap again to delete the scorecard and its ${P} hole${P === 1 ? '' : 's'} of scores` : 'Tap again to delete the scorecard'; return }
    b.disabled = true
    try { await api.deleteRound(round.id) } catch (err) { toast(err.message); b.disabled = false; return }
    resetRound()
    await render()
    top0()
    toast(round.slotId ? 'Scorecard deleted. Your booking is still there.' : 'Scorecard deleted')
  }

  bindEvents(events, me)
  bindLeagueBox(round, leagues, entries, members)

  document.querySelectorAll('[data-chk-ok]').forEach(b => (b.onclick = () => { round.checks.splice(+b.dataset.chkOk, 1); keepScroll(render) }))
  document.querySelectorAll('[data-chk-go]').forEach(b => (b.onclick = () => { const c = round.checks.splice(+b.dataset.chkGo, 1)[0]; S.ch = c.i; keepScroll(render) }))

  // Guest handicaps can be set or changed at any time; everything recalculates.
  document.querySelectorAll('[data-gh]').forEach(b => (b.onclick = () => guestHcpSheet(ps[+b.dataset.gh])))

  // Scorecard
  document.querySelectorAll('[data-j]').forEach(b => (b.onclick = () => {
    const j = +b.dataset.j
    if (j > P) { toast(`Finish hole ${P + 1} first`); return }
    S.ch = j
    keepScroll(render)
  }))
  document.querySelectorAll('[data-k]').forEach(b => (b.onclick = () => {
    const k = +b.dataset.k, v = round.scores[i][k] + +b.dataset.d
    if (v < 1 || v > 12) return
    round.scores[i][k] = v
    ;(round.entered ??= round.scores.map(r => r.map(() => null)))[i][k] = me.id // who typed it: see card-view.js trust()
    ;(round.changed ??= new Set()).add(`${i}:${k}`)
    keepScroll(render)
  }))
  const on = (id, f) => { const el = $(id); if (el) el.onclick = f }
  on('prevh', () => { S.ch--; render() })
  on('save', async () => {
    round.done[i] = true
    await api.saveRound(round)
    const after = stateAt(played(round))
    if (!after.finished && i < 17) S.ch = i + 1
    await render()
    top0()
    if (i === 7) forceAlertCheck() // hole 8: the halfway hut may ask
    if (after.finished) toast(after.match ? `Match over: ${after.match.text}` : 'Round complete')
  })
  on('submit', async () => {
    round.submitted[round.game] = true
    await api.saveRound(round)
    await render()
    toast('Round saved. Your scores are on the leaderboard')
  })
  on('newr', async () => {
    setRound(newRound(course, round.lineup, round.game, round.slotId))
    await api.saveRound(round)
    if (G.pairs) S.gmenu = true
    await render()
    top0()
    toast('New scorecard started')
  })
}

function standings(ps, gs, g) {
  const rows = ps.map((p, k) => ({ p, k, v: gs.totals[k] })).sort((a, b) => (g === 'stroke' ? a.v - b.v : b.v - a.v))
  const unit = g === 'stab' || g === 'six' ? 'pts' : g === 'skins' ? 'skins' : 'net'
  return `<div class="card list">${rows.map((r, n) => `<div class="lrow" style="grid-template-columns:24px 44px 1fr auto"><span style="font-weight:800;text-align:center">${n + 1}</span><span class="av">${ini(r.p.name)}</span><span class="who"><strong>${esc(r.p.name)}${r.k === 0 ? ' (you)' : ''}</strong></span><span class="hcp">${g === 'stroke' ? toPar(r.v) : r.v}<small>${unit}</small></span></div>`).join('')}</div>`
}

export function getRound() {
  return round
}

// No card yet today: start one from your tee time (all four, guests included), or pick buddies.
function startScreen({ course, L, me, teeTimes, events }) {
  header('New round', '')
  const names = s => s.players.map(p => esc(p.memberId === me.id ? 'You' : p.name) + (p.guest ? ' (guest)' : '')).join(', ')
  $('main').innerHTML = `<div class="screen">${eventsTop(events, me)}
    ${teeTimes.length ? teeTimes.map(s => `<button class="card hnext" data-slot="${s.id}"><span class="kick">Your tee time today</span><span class="hnt num">${hhmm(s.time)}</span><span class="sub">${names(s)}</span></button>`).join('')
      : '<div class="empty-state">You’re not on a tee time today. Pick who you’re playing with instead.</div>'}
    <button class="ghost" id="pick">${teeTimes.length ? 'Pick players instead' : 'Pick players'}</button>
    <div class="hint">Cards are for 2 to 4 players. Better-ball games need four.</div>
    ${eventsBottom(events, true)}</div>`
  document.querySelectorAll('[data-slot]').forEach(b => (b.onclick = async () => {
    const s = teeTimes.find(x => x.id === +b.dataset.slot)
    if (s.players.length < 2) { toast('You’re the only one on that tee time so far'); return }
    const lineup = lineupFromTeeTime(s, me.id)
    setRound(newRound(course, lineup, NO_GAME, s.id)) // scores only until someone adds a match
    S.sview = 'counts' // Scoring round? (leagues and events this card could count for)
    await render()
    top0()
  }))
  $('pick').onclick = async () => { S.pickTmp = []; S.sview = 'players'; await render(); top0() }
}

// + Add a match (or tap the game to change it): a game for the group, one against one with someone on the card,
// a challenge to another four-ball, or back to scores only.
function matchSheet({ L, n, ps }) {
  const now = parseGame(round.game)
  const group = playable(L, n), ones = oneOnOneGames(L)
  let mode = null, gk = group.some(x => x.k === now.base) && !now.pair ? now.base : preferredGame(L, n)
  let ok = ones.some(x => x.k === now.base) ? now.base : ones.find(x => x.k === 'kos')?.k ?? ones[0]?.k, opp = null
  // Members out today in other groups (from a booked tee time only): [{ id (booking player), name, time }]
  let out = round.slotId ? null : []
  const close = () => { $('modal').innerHTML = '' }
  const save = async (game, pairsMenu = false) => { round.game = game; if (pairsMenu) S.gmenu = true; await api.saveRound(round); close(); keepScroll(render) }
  const challenge = async () => {
    const who = out.find(x => x.id === +opp.slice(1))
    $('am-go').disabled = true
    try { await api.proposeSingles(round.slotId, who.id, ok) } catch (err) { $('amerr').textContent = err.message; $('am-go').disabled = false; return }
    close(); await keepScroll(render)
    toast(`Challenge sent to ${who.name}. It’s on once they accept`)
  }
  const choice = (k, t, sub) => `<button class="card pecard" data-am="${k}"><span class="pe-tx"><b>${t}</b><small>${sub}</small></span><span class="chev">›</span></button>`
  const radio = (attr, x, on) => `<button class="gamecard sm" role="radio" aria-checked="${on}" ${attr}="${x.k}"><span class="radio"></span><span class="who"><strong>${esc(x.name)}</strong><small>${esc(x.desc)}</small></span></button>`
  const person = (key, name, sub = '') => `<button class="gamecard sm" role="radio" aria-checked="${opp === key}" data-op="${key}"><span class="radio"></span><span class="who"><strong>${esc(name)}</strong>${sub ? `<small>${sub}</small>` : ''}</span></button>`
  const draw = () => {
    const body = !mode ? `<h4 id="amt">${now.base === NO_GAME ? 'Add a match' : 'Change the match'}</h4>
        ${n >= 2 ? choice('group', `A game for ${n === 4 ? 'the four-ball' : n === 3 ? 'the three-ball' : 'the two of you'}`, 'Better ball, skins, Stableford and more, everyone on this card') : ''}
        ${n >= 2 || round.slotId ? choice('one', 'One against one', `You against one player${n >= 2 ? ' on your card' : ''}${round.slotId ? `${n >= 2 ? ' or' : ''} out today` : ''}, match play`) : ''}
        ${choice('challenge', 'Challenge another four-ball', 'A match against a group on today’s tee sheet')}
        ${now.base !== NO_GAME ? choice('none', 'No match: scores only', 'Everyone’s own score and Stableford points') : ''}`
      : mode === 'group' ? `<h4 id="amt">A game for the group</h4><div class="games" role="radiogroup" aria-label="Game">${group.map(x => radio('data-gk', x, x.k === gk)).join('')}</div>`
      : `<h4 id="amt">One against one</h4>
        ${n >= 2 ? `<span class="kicker">On your card</span><div class="games" role="radiogroup" aria-label="Opponent on your card">${ps.map((p, k) => (k ? person(`c${k}`, p.name) : '')).join('')}</div>` : ''}
        ${round.slotId ? `<span class="kicker">Out today</span>${out == null ? '<p class="hint">Loading today’s tee sheet…</p>'
          : out.length ? `<div class="games" role="radiogroup" aria-label="Opponent out today">${out.map(x => person(`t${x.id}`, x.name, `${hhmm(x.time)} · they’re asked to accept`)).join('')}</div>`
          : '<p class="hint">No other members are booked today.</p>'}` : ''}
        <span class="kicker">Game</span><div class="games" role="radiogroup" aria-label="Game">${ones.map(x => radio('data-ok', x, x.k === ok)).join('')}</div>
        <p class="gerr" id="amerr" role="alert"></p>`
    const go = mode === 'one' && opp == null ? 'Pick who' : mode === 'one' && opp[0] === 't' ? 'Send challenge' : 'Play this'
    $('modal').innerHTML = `<div class="overlay" id="ovl"><div class="sheet" role="dialog" aria-labelledby="amt">${body}
      <div class="gm-btns"><button type="button" class="ghost" id="am-no">${mode ? 'Back' : 'Cancel'}</button>${mode ? `<button class="primary" id="am-go" ${mode === 'one' && opp == null ? 'disabled' : ''}>${go}</button>` : ''}</div></div></div>`
    $('am-no').onclick = () => { if (mode) { mode = null; draw() } else close() }
    $('ovl').onclick = e => { if (e.target.id === 'ovl') close() }
    document.querySelectorAll('[data-am]').forEach(b => (b.onclick = async () => {
      const k = b.dataset.am
      if (k === 'none') return save(NO_GAME)
      if (k === 'challenge') { close(); S.sview = 'challenge'; await render(); top0(); return }
      mode = k; draw()
      if (k === 'one' && out == null) {
        const onCard = new Set(round.lineup.map(x => x.m).filter(m => m != null))
        const sheet = await api.getTeeSheet(isoDate(today()))
        out = sheet.filter(sl => sl.id !== round.slotId).flatMap(sl => sl.players.filter(p => !p.guest && !onCard.has(p.memberId)).map(p => ({ id: p.id, name: p.name, time: sl.time })))
        if (mode === 'one') draw()
      }
    }))
    document.querySelectorAll('[data-gk]').forEach(b => (b.onclick = () => { gk = b.dataset.gk; draw() }))
    document.querySelectorAll('[data-ok]').forEach(b => (b.onclick = () => { ok = b.dataset.ok; draw() }))
    document.querySelectorAll('[data-op]').forEach(b => (b.onclick = () => { opp = b.dataset.op; draw() }))
    if ($('am-go')) $('am-go').onclick = () => (mode === 'group' ? save(gk, n === 4 && !!L.lib[gk]?.play?.pairs) : opp[0] === 't' ? challenge() : save(oneOnOneKey(ok, round.lineup[0], round.lineup[+opp.slice(1)])))
  }
  draw()
}
