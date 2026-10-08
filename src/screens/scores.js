// Scores tab: hole-by-hole scorecard for the group, with the game drop-down and pairings.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, sur, header, keepScroll, top0, render, toast, parseHcp, fmtHcp } from '../ui.js'
import { today, hhmm, isoDate, eventLastDay, leagueWeek } from '../dates.js'
import { banners, bindBanners, pendingInvite, invitePopup } from './player-events.js'
import { holeGrid } from '../course-art.js'
import { courseHandicap, playingHandicaps, holeCalc, betterBallWinner, gameState, upText, toPar, sixPointer } from '../scoring.js'
import { buildLibrary, playable, gameSpec, resolveGame, preferredGame, teeRating, PAIRINGS } from '../games.js'

// The round is kept here between redraws so unsaved stepper changes survive; api.saveRound() persists it.
// round.lineup: the card's players in order, each { m: memberId } or { g: guestId }; the first is you.
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
  round ??= await api.getCurrentRound()
  const guests = round ? await api.getGuests(round.lineup.filter(e => e.g != null).map(e => e.g)) : []
  // Leagues running this week that someone on this card plays in.
  const t = isoDate(today())
  const leagues = round ? allEvents.filter(e => e.style === 'league' && e.startDate <= t && eventLastDay(e) >= t && round.lineup.some(x => e.players.includes(x.m))) : []
  const entries = await api.getLeagueEntries(leagues.map(e => e.id))
  return { course, members, guests, L: buildLibrary(games), me, teeTimes, events, leagues, entries }
}

// Player event banners go at the top of the Scores tab; the "play an event" link at the bottom.
const eventsTop = (events, me) => banners(events, me)
function eventsBottom(events) {
  const busy = events.some(e => e.status === 'pending' || e.status === 'accepted')
  return busy ? '' : '<button class="linkbtn" id="pe-new" style="align-self:flex-start">+ Play an event with other groups</button>'
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
  round.game = resolveGame(L, round.game, n)
  S.ch ??= Math.min(played(round), 17)
  const o = PAIRINGS[round.pairing], LG = L.lib[round.game], G = gameSpec(LG), g = G.kind
  const ph = playingHandicaps(ps.map(p => courseHandicap(p.hcp ?? 0, teeRating(course))), G.allow, G.offLow)
  const noHcp = ps.filter(p => p.guestId && p.hcp == null)
  const i = S.ch, h = course.holes[i], P = played(round)
  const c = holeCalc(h, round.scores[i], ph, o), gs = gameState(G, course.holes, ph, round.scores, P, o)
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
    <div class="gm-sec"><span class="gm-lbl">Game</span><div class="games" role="radiogroup" aria-label="Game">${playable(L, n).map(x => `<button class="gamecard sm" role="radio" aria-checked="${x.k === round.game}" data-gm="${x.k}"><span class="radio"></span><span class="who"><strong>${esc(x.name)}${x.k === preferredGame(L, n) ? ' ★' : ''}</strong><small>${esc(x.sub)}${x.pct != null ? ` ${x.pct}%` : ''}</small></span></button>`).join('')}</div></div>
    ${G.pairs ? `<div class="gm-sec"><span class="gm-lbl">Pairs</span><div class="games" role="radiogroup" aria-label="Pairs">${PAIRINGS.map((pp, n) => `<button class="gamecard sm" role="radio" aria-checked="${round.pairing === n}" data-pr="${n}"><span class="radio"></span><span class="who"><strong>You & ${esc(ps[pp[1]].name)}</strong><small>v ${esc(ps[pp[2]].name)} & ${esc(ps[pp[3]].name)}</small></span></button>`).join('')}</div></div>` : ''}
    <div class="gm-sec"><span class="gm-lbl">Players and shots</span><div class="gm-players">${ps.map((p, k) => `<div><span>${esc(p.name)}${k === 0 ? ' (you)' : ''}${p.guestId ? ` · guest · ${p.hcp == null ? '<button class="linkbtn" data-gh="' + k + '">set handicap</button>' : `index ${fmtHcp(p.hcp)} <button class="linkbtn" data-gh="${k}">change</button>`}` : ''}</span><b>${ph[k]}</b></div>`).join('')}</div>
      <span class="hint">${G.offLow ? 'Shots off the lowest playing handicap.' : G.allow ? `Playing handicap at ${Math.round(G.allow * 100)}% of course handicap.` : 'Scratch: no shots.'} Course handicaps from the white tees (${teeRating(course).rating} / ${teeRating(course).slope}).</span></div>
    <div class="gm-btns"><button class="ghost" id="chg">Change players</button><button class="primary" id="gdone">Done</button></div>
    <button class="ghost accremove" id="delcard">Delete this card</button></div>` : ''

  const sideA = k => o.indexOf(k) < 2
  const best = k => {
    if (g === 'match') return G.cmp === 'pts' ? c.pts[k] === (sideA(k) ? c.pA : c.pB) : c.net[k] === (sideA(k) ? c.nA : c.nB)
    if (g === 'stab' || pts) return c.pts[k] === Math.max(...c.pts)
    return c.net[k] === Math.min(...c.net)
  }
  const card = k => {
    const p = ps[k], gr = round.scores[i][k], sh = c.sh[k]
    const hc = p.guestId ? (p.hcp == null ? `<button class="sethcp" data-gh="${k}">Set handicap</button>` : `<button class="linkbtn h" data-gh="${k}" aria-label="Change ${esc(p.name)}'s handicap">(${ph[k]})</button>`) : `<span class="h">(${ph[k]})</span>`
    return `<div class="pcard${best(k) ? ' counts' : ''}"><span class="av${p.guestId ? ' gst' : ''}">${ini(p.name)}</span><span class="who"><strong>${esc(p.name)} ${hc}</strong>
      <span class="pills">${sh ? `<span class="pill">${sh} shot${sh > 1 ? 's' : ''}</span>` : ''}<span class="pill">${pts ? `${c.pts[k]} pts` : G.allow ? `net ${c.net[k]}` : `gross ${gr}`}</span>${leagueBadges(round.lineup[k]?.m, leagues, entries)}</span></span>
      <span class="stepper"><button data-k="${k}" data-d="-1" aria-label="One fewer for ${esc(p.name)}">−</button><output class="${round.done[i] ? '' : 'draft'}">${gr}</output><button data-k="${k}" data-d="1" aria-label="One more for ${esc(p.name)}">+</button></span></div>`
  }

  let verdict = ''
  if (g === 'match') {
    const w = betterBallWinner(c, G.cmp)
    verdict = w > 0 ? '<span class="result-pill W">Your pair wins the hole</span>' : w < 0 ? '<span class="result-pill L">They win the hole</span>' : '<span class="result-pill H">Hole halved</span>'
  }
  if (g === 'match1') {
    const w = G.cmp === 'pts' ? Math.sign(c.pts[0] - c.pts[1]) : Math.sign(c.net[1] - c.net[0])
    verdict = w > 0 ? '<span class="result-pill W">You win the hole</span>' : w < 0 ? `<span class="result-pill L">${esc(sur(ps[1].name))} wins the hole</span>` : '<span class="result-pill H">Hole halved</span>'
  }
  if (g === 'six') {
    const share = sixPointer(G.cmp === 'pts' ? c.pts : c.net.map(x => -x))
    verdict = `<span class="result-pill ${share[0] === 4 ? 'W' : share[0] === 0 ? 'L' : 'H'}">${share.join(' / ')} · you ${share[0]}</span>`
  }
  if (g === 'skins') {
    const lo = Math.min(...c.net), w = c.net.filter(n => n === lo).length === 1 ? c.net.indexOf(lo) : -1
    verdict = w >= 0 ? `<span class="result-pill ${w === 0 ? 'W' : 'H'}">Skin to ${esc(sur(ps[w].name))}</span>` : '<span class="result-pill H">Carries over</span>'
  }
  const sideLbl = s => (G.cmp === 'pts' ? `${s === 'A' ? c.pA : c.pB} pts` : `best ${G.allow ? 'net' : 'score'} ${s === 'A' ? c.nA : c.nB}`)
  const body = G.pairs
    ? `<div class="sidehead"><b>You & ${esc(sur(ps[o[1]].name))}</b><span>${sideLbl('A')}</span></div>${card(o[0])}${card(o[1])}
       <div class="sidehead"><b>${esc(pairName('B')).replace(' / ', ' &amp; ')}</b><span>${sideLbl('B')}</span></div>${card(o[2])}${card(o[3])}`
    : ps.map((_, k) => card(k)).join('')

  let line
  if (!gs.thru) line = 'Not started'
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
  const hcpNote = noHcp.length ? `<div class="hcpnote">${noHcp.map(p => esc(p.name.split(' ')[0])).join(' and ')} ${noHcp.length > 1 ? 'have' : 'has'} no handicap yet, so ${noHcp.length > 1 ? 'they play' : 'plays'} off an index of 0 until you set one. Shots and points update as soon as you do.</div>` : ''
  $('main').innerHTML = `<div class="screen">${eventsTop(events, me)}${leagueLine(leagues, entries, members)}${grid}${hcpNote}
    <div class="matchline"><button class="gamesel" id="gchip" aria-expanded="${!!S.gmenu}" aria-controls="gmenu">${esc(LG.name)}${CHEV}</button><b>${esc(line)}</b></div>
    ${gamebar}
    ${body}
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="hint">${round.done[i] ? 'Saved' : 'Gross scores. Shots applied automatically.'}</span>${verdict}</div>
    ${!G.pairs && g !== 'match1' && gs.thru ? `<h3>Standings</h3>${standings(ps, gs, g)}` : ''}
    ${eventsBottom(events)}
  </div>
  <div class="cta">${fin
    ? round.submitted[round.game] ? '<button class="primary" id="newr">Start a new round</button>' : '<button class="primary" id="submit">Finish round</button>'
    : `<button class="ghost" id="prevh" ${i === 0 ? 'disabled' : ''}>‹</button><button class="primary" id="save">${round.done[i] ? 'Next hole' : `Save hole ${i + 1}`}</button>`}</div>`

  // Game menu
  $('gchip').onclick = async () => { S.gmenu = !S.gmenu; await render(); top0() }
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
    $('delcard').onclick = async () => {
      const b = $('delcard')
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = P ? `Tap again to delete this card and its ${P} hole${P === 1 ? '' : 's'} of scores` : 'Tap again to delete this card'; return }
      b.disabled = true
      if (round.id) await api.deleteRound(round.id)
      resetRound()
      await render()
      top0()
      toast('Card deleted')
    }
  }

  bindEvents(events, me)
  bindLeagueBox(leagues, entries, members)

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
    keepScroll(render)
  }))
  const on = (id, f) => { const el = $(id); if (el) el.onclick = f }
  on('prevh', () => { S.ch--; render() })
  on('save', async () => {
    round.done[i] = true
    await api.saveRound(round)
    const after = gameState(G, course.holes, ph, round.scores, played(round), o)
    if (!after.finished && i < 17) S.ch = i + 1
    await render()
    top0()
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

// League entry: before hole 1 the card keeper is asked, once, whether today's round counts for each
// league player on the card (one entered round a week each; locked once hole 1 is saved). Players
// whose round counts get a badge on the card; a line at the top shows who's counting.
const initials = name => name.split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase()).join('').slice(0, 3)
const leagueWeekNow = e => leagueWeek(e, isoDate(today()))
const entered = (entries, e, id) => round.id != null && entries.some(x => x.eventId === e.id && x.memberId === id && x.roundId === round.id)
const enteredElsewhere = (entries, e, id) => !entered(entries, e, id) && entries.some(x => x.eventId === e.id && x.memberId === id && x.week === leagueWeekNow(e))
const leaguePlayers = e => round.lineup.filter(x => x.m != null && e.players.includes(x.m)).map(x => x.m)
const firstName = (members, id) => (members.find(m => m.id === id)?.name ?? '').split(' ')[0]

function leagueBadges(memberId, leagues, entries) {
  if (memberId == null) return ''
  return leagues.filter(e => entered(entries, e, memberId)).map(e => `<span class="pill wlpill on" title="This round counts for ${esc(e.name)}">${esc(initials(e.name))}</span>`).join('')
}

// Answered (or put off) per card in this visit; answered also remembered on this phone.
const askedKey = () => `teemate.lgAsked.${round.id}`
function answered() {
  if (S.lgLater === round) return true
  try { return round.id != null && localStorage.getItem(askedKey()) === '1' } catch { return false }
}
function markAnswered() { try { localStorage.setItem(askedKey(), '1') } catch { /* fine: it asks again */ } }

function leagueLine(leagues, entries, members) {
  const started = round.done.some(Boolean)
  return leagues.filter(e => leaguePlayers(e).length).map(e => {
    const on = leaguePlayers(e).filter(id => entered(entries, e, id)), names = on.map(id => esc(firstName(members, id))).join(', ')
    if (started) return on.length ? `<div class="lgline locked"><span>🏆 ${esc(e.name)} week ${leagueWeekNow(e)} · <b>${names}</b> counting · locked</span></div>` : ''
    return `<div class="lgline"><span>🏆 ${esc(e.name)} week ${leagueWeekNow(e)} · ${on.length ? `<b>${names}</b> counting` : 'not counting yet'}</span><button class="linkbtn" data-lgask>${on.length ? 'Change' : 'Choose'}</button></div>`
  }).join('')
}

function leagueSheet(leagues, entries, members) {
  const list = leagues.filter(e => leaguePlayers(e).length)
  const ans = S.lgAns
  const name = id => members.find(m => m.id === id)?.name ?? ''
  const askable = list.flatMap(e => leaguePlayers(e).filter(id => !enteredElsewhere(entries, e, id)).map(id => `${e.id}:${id}`))
  const ready = askable.every(k => ans[k] != null)
  $('modal').innerHTML = `<div class="overlay" id="ovl"><div class="sheet lgsheet" role="dialog" aria-labelledby="lgq">
    ${list.map(e => `<span class="kicker">🏆 ${esc(e.name)} · Week ${leagueWeekNow(e)}</span>`).join('')}
    <h4 id="lgq">Count today's round?</h4>
    <p class="hint">Their Stableford score goes towards their team's total for the week. Only one round a week counts.</p>
    ${askable.length > 1 ? `<button class="ghost" id="lg-all">Yes for everyone</button>` : ''}
    ${list.map(e => leaguePlayers(e).map(id => {
      const team = e.teams?.[e.team?.[id]]?.name, me = id === round.lineup[0].m
      if (enteredElsewhere(entries, e, id)) return `<div class="ask done"><span class="av">${ini(name(id))}</span><span class="who"><strong>${esc(name(id))}</strong><small>${team ? esc(team) + ' · ' : ''}already counted a round this week</small></span></div>`
      const k = `${e.id}:${id}`
      return `<div class="ask"><span class="av">${ini(name(id))}</span><span class="who"><strong>${esc(name(id))}${me ? ' (you)' : ''}</strong><small>${team ? esc(team) : ''}</small></span>
        <div class="yn"><button class="yes" data-yn="${k}" data-v="1" aria-pressed="${ans[k] === true}">Yes, count it</button><button class="no" data-yn="${k}" data-v="0" aria-pressed="${ans[k] === false}">Not this one</button></div></div>`
    }).join('')).join('')}
    <div class="gm-btns"><button type="button" class="ghost" id="lg-later">Ask me later</button><button class="primary" id="lg-done" ${ready ? '' : 'disabled'}>Done</button></div>
    <span class="hint" style="text-align:center">You can change this until hole 1 is saved.</span>
  </div></div>`
  const redraw = () => leagueSheet(leagues, entries, members)
  document.querySelectorAll('[data-yn]').forEach(b => (b.onclick = () => { ans[b.dataset.yn] = b.dataset.v === '1'; redraw() }))
  if ($('lg-all')) $('lg-all').onclick = () => { askable.forEach(k => (ans[k] = true)); redraw() }
  const close = () => { S.lgOpenSheet = false; $('modal').innerHTML = '' }
  $('lg-later').onclick = () => { S.lgLater = round; close(); keepScroll(render) }
  $('ovl').onclick = e => { if (e.target.id === 'ovl') { S.lgLater = round; close(); keepScroll(render) } }
  $('lg-done').onclick = async () => {
    $('lg-done').disabled = true
    try {
      if (!round.id) await api.saveRound(round) // the card needs to exist to be entered
      for (const e of list) {
        const ids = leaguePlayers(e).filter(id => ans[`${e.id}:${id}`] != null)
        const yes = ids.filter(id => ans[`${e.id}:${id}`] && !entered(entries, e, id)), no = ids.filter(id => !ans[`${e.id}:${id}`] && entered(entries, e, id))
        if (yes.length) await api.enterLeague(round.id, e.id, yes)
        if (no.length) await api.leaveLeague(round.id, e.id, no)
      }
    } catch (err) {
      toast(err.message)
      $('lg-done').disabled = false
      return
    }
    markAnswered()
    close()
    const n = Object.values(ans).filter(Boolean).length
    await keepScroll(render)
    toast(n ? `${n} counting for the league this week` : 'Not counting this round')
  }
}

function bindLeagueBox(leagues, entries, members) {
  if (!leagues.some(e => leaguePlayers(e).length) || round.done.some(Boolean)) return
  const open = () => {
    // start from what's saved: entered = yes; asked before and not entered = no
    S.lgAns = {}
    for (const e of leagues) for (const id of leaguePlayers(e)) if (!enteredElsewhere(entries, e, id)) {
      if (entered(entries, e, id)) S.lgAns[`${e.id}:${id}`] = true
      else if (answered() && S.lgLater !== round) S.lgAns[`${e.id}:${id}`] = false
    }
    S.lgOpenSheet = true
    leagueSheet(leagues, entries, members)
  }
  document.querySelectorAll('[data-lgask]').forEach(b => (b.onclick = open))
  // Ask straight away on a fresh card, unless everyone has already counted a round this week.
  const anyAskable = leagues.some(e => leaguePlayers(e).some(id => !enteredElsewhere(entries, e, id)))
  if (S.lgOpenSheet || (anyAskable && !answered() && !leagues.some(e => leaguePlayers(e).some(id => entered(entries, e, id))))) open()
}

export function getRound() {
  return round
}

// No card yet today: start one from your tee time (all four, guests included), or pick buddies.
function startScreen({ course, L, me, teeTimes, events }) {
  header('Scores', 'Start today’s card')
  const names = s => s.players.map(p => esc(p.memberId === me.id ? 'You' : p.name) + (p.guest ? ' <span class="pill tag">Guest</span>' : '')).join(', ')
  $('main').innerHTML = `<div class="screen">${eventsTop(events, me)}
    ${teeTimes.length ? teeTimes.map(s => `<button class="card evrow" data-slot="${s.id}"><span class="who"><strong>Start card for your ${hhmm(s.time)}</strong><small>${names(s)}</small></span><span class="pill">${s.players.length} players</span></button>`).join('')
      : '<div class="empty-state">You’re not on a tee time today. Pick who you’re playing with instead.</div>'}
    <button class="ghost" id="pick">${teeTimes.length ? 'Pick players instead' : 'Pick players'}</button>
    <div class="hint">Cards are for 2 to 4 players. Better-ball games need four.</div>
    ${eventsBottom(events)}</div>`
  document.querySelectorAll('[data-slot]').forEach(b => (b.onclick = async () => {
    const s = teeTimes.find(x => x.id === +b.dataset.slot)
    if (s.players.length < 2) { toast('You’re the only one on that tee time so far'); return }
    const lineup = lineupFromTeeTime(s, me.id)
    setRound(newRound(course, lineup, preferredGame(L, lineup.length), s.id))
    if (lineup.length === 4 && L.lib[round.game]?.play?.pairs) S.gmenu = true
    await render()
    top0()
    toast(`Card started for your ${hhmm(s.time)}`)
  }))
  $('pick').onclick = async () => { S.pickTmp = []; S.sview = 'players'; await render(); top0() }
}

// Set, change or clear a guest's handicap index.
function guestHcpSheet(p) {
  $('modal').innerHTML = `<div class="overlay" id="ovl"><form class="sheet" id="hform" novalidate aria-labelledby="htitle">
    <h4 id="htitle">${esc(p.name)}’s handicap</h4>
    <label for="h-idx">Handicap index</label><input id="h-idx" inputmode="decimal" autocomplete="off" value="${p.hcp == null ? '' : fmtHcp(p.hcp)}" placeholder="e.g. 18.4, or +2">
    <span class="hint">No official handicap? Agree one with them. You can change it any time, even mid-round.</span>
    <p class="gerr" id="herr" role="alert"></p>
    <div class="gm-btns"><button type="button" class="ghost" id="hcancel">Cancel</button><button type="submit" class="primary" id="hsave">Save</button></div>
  </form></div>`
  setTimeout(() => $('h-idx')?.focus(), 30)
  const close = () => { $('modal').innerHTML = '' }
  $('hcancel').onclick = close
  $('ovl').onclick = e => { if (e.target.id === 'ovl') close() }
  $('hform').onsubmit = async e => {
    e.preventDefault()
    const h = parseHcp($('h-idx').value)
    if (Number.isNaN(h)) { $('herr').textContent = 'Enter a handicap index between +10 and 54, e.g. 18.4.'; return }
    $('hsave').disabled = true
    try {
      await api.setGuestHandicap(p.guestId, h)
    } catch (err) {
      $('herr').textContent = err.message
      $('hsave').disabled = false
      return
    }
    close()
    await keepScroll(render)
    toast(h == null ? `${p.name}’s handicap cleared` : `${p.name} now plays off ${fmtHcp(h)}`)
  }
}
