// The board for an event set up in advance, scored live from each player's own card on each day.
// Shown on the Leaderboard tab while it's on, and from Admin → Events (View / Results).
import { holesText } from '../open-holes.js'
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, sur, header, keepScroll, render, redraw, top0, toast, goBack } from '../ui.js'
import { courseHandicap, fmtPts, toPar } from '../scoring.js'
import { scoreAdvanceEvent, scoreLeague, scorePairsLeague, leagueSeeds } from '../event-scoring.js'
import { spreadDates } from '../knockout.js'
import { buildLibrary, teeRating, EVENT_ALLOWANCE_GAME } from '../games.js'
import { addDaysIso, eventDates, isoDate, today, fromIso, longDay, leagueWeek } from '../dates.js'
import { EVENT_TYPES, eventFormat } from './event-editor.js'
import { myMatch, matchBooking } from '../match.js'
import { matchDays, dayDate, seasonEnd, SINGLES_FMT, canChange } from '../season.js'
import { matchType, dayRules } from '../match-scoring.js'
import { matchActionHtml, bindMatchAction } from './match.js'

export async function loadBoard(id, dayWanted = null) {
  const [events, members, course, games] = await Promise.all([api.getEvents(), api.getMembers(), api.getCourse(), api.getGameSettings()])
  const e = events.find(x => x.id === id)
  if (!e) return { e: null }
  if (e.style === 'league') {
    const entries = await api.getLeagueEntries([e.id])
    const cards = await api.getCardsById([...new Set(entries.map(x => x.roundId))])
    return { e, members, course, L: buildLibrary(games), entries, cards, me: await api.getMe() }
  }
  const days = matchDays(e), dates = days.map(d => dayDate(e, d))
  const [cards, entries] = await Promise.all([api.getCardsOn(dates), e.entryRequired ? api.getEventEntries([e.id]) : []])
  const dayCards = Object.fromEntries(days.map((d, i) => [d, cards.filter(c => c.date === dates[i])]))
  const me = await api.getMe()
  // My match on the day shown (a season: my next match day), and where its players are booked that day (for Book this match / Start scoring).
  const day = e.season ? dayWanted ?? myNextDay(e, me.id) : Math.min(dayWanted ?? (S.evDay || dayOf(e)), e.days), mine = myMatch(e, day, me.id)
  let action = null
  if (mine && !(e.season && dayDate(e, day) < isoDate(today()))) { // nothing to book for a match day that's gone
    const ids = [...mine.a, ...mine.b], date = dayDate(e, day)
    const sheet = await api.getTeeSheet(date).catch(() => [])
    const name = mid => members.find(x => x.id === mid)?.name ?? 'A player'
    action = { ...matchBooking(ids, sheet, me.id), date, ids, meId: me.id, names: name, eventName: e.name,
      started: (dayCards[day] ?? []).some(c => ids.every(mid => c.lineup.some(x => x.m === mid))) }
    // A season's singles can be played in each player's own tee time: no "all four together" advice.
    if (matchType(mine) !== 'four' && ['apart', 'split'].includes(action.kind)) action = null
    // Rearrange: only when the four are one booking with nobody else on it (so moving it bumps no one).
    if (action?.kind === 'together' && !action.started) {
      const b = (await api.getMyBookings()).find(x => x.date === date && x.time === action.slot.time)
      const inIt = b?.people.filter(p => p.inBooking) ?? []
      if (b && inIt.length === ids.length && inIt.every(p => p.memberId != null && ids.includes(p.memberId))) action.moveBooking = b.id
    }
  }
  return { e, members, course, L: buildLibrary(games), dayCards, entries, me, mine, action, day }
}

/** A season: my match day from today on (else the next match day, else the last one). */
function myNextDay(e, meId) {
  const now = isoDate(today()), ahead = matchDays(e).filter(d => dayDate(e, d) >= now)
  return ahead.find(d => myMatch(e, d, meId)) ?? ahead[0] ?? matchDays(e).at(-1) ?? 1
}

/** Which day of the event today is (1-based), clamped to the event's days. */
export const dayOf = e => Math.min(e.days, Math.max(1, Math.round((fromIso(isoDate(today())) - fromIso(e.startDate)) / 864e5) + 1))

/** The event scored from the players' cards (scoreAdvanceEvent), for the board and each match's page. */
export function boardResult({ e, members, course, L, dayCards, entries }) {
  const tee = teeRating(course)
  const m = id => members.find(x => x.id === id)
  const player = id => ({ name: m(id)?.name ?? 'Former member', courseHcp: courseHandicap(m(id)?.hcp ?? 0, tee) })
  const pct = k => (L.lib[k]?.pct == null ? 0 : L.lib[k].pct / 100)
  return scoreAdvanceEvent(e, course.holes, dayCards, player, { four: pct(EVENT_ALLOWANCE_GAME[e.fmt]), singles: pct(SINGLES_FMT[e.fmt]), stab: pct('stab'), base: pct(EVENT_ALLOWANCE_GAME[e.fmt]) }, entries)
}

export function boardHtml(data, top = '') {
  if (data.e.style === 'league') return leagueHtml(data, top)
  const { e, me } = data
  const r = boardResult(data)
  const day = Math.min(S.evDay || dayOf(e), e.days)
  const thruText = (n, of = 18) => (n === of ? 'Finished' : n ? `thru ${n}` : 'not started')
  const notYet = e.startDate > isoDate(today())
  const head = `<div class="matchline"><b style="color:var(--ink)">${EVENT_TYPES[e.style].name}${e.style !== 'teams' ? ` · ${eventFormat(e)}` : ''}</b><span>${e.season ? `Season · ${eventDates(e.startDate, 1)} – ${eventDates(seasonEnd(e), 1)}` : eventDates(e.startDate, e.days)}${e.club ? ' · club event' : ''}</span></div>`
  const A = e.A, B = e.B
  let body = ''

  if (r.kind === 'ryder' && e.season) body = seasonHtml(data, r)
  else if (r.kind === 'ryder') {
    const sc = r.score, wA = sc.tot ? (sc.pA / sc.tot) * 100 : 0, wB = sc.tot ? (sc.pB / sc.tot) * 100 : 0
    const matches = r.byDay[day] ?? []
    body = `<div class="card evscore">
        <div class="tug"><i class="ta" style="width:${wA}%;background:${A.col}"></i><i class="tb" style="width:${wB}%;background:${B.col}"></i><span class="mid"></span></div>
        <div class="evteams"><div><span class="tn" style="color:${A.col}">${esc(A.name)}</span><span class="tp" style="color:${A.col}">${fmtPts(sc.pA)} <small>projected</small></span><small>${fmtPts(sc.cA)} confirmed</small></div>
          <div class="r"><span class="tn" style="color:${B.col}">${esc(B.name)}</span><span class="tp" style="color:${B.col}">${fmtPts(sc.pB)} <small>projected</small></span><small>${fmtPts(sc.cB)} confirmed</small></div></div>
        <div class="evfoot">${sc.toWin != null ? `${fmtPts(sc.toWin)} to win · ` : ''}${fmtPts(sc.tot)} point${sc.tot === 1 ? '' : 's'} available</div></div>
      ${e.days > 1 ? daySelect(e, r, day) : ''}
      ${matches.map((mt, k) => matchCard(data, mt, k, day)).join('') || '<div class="empty-state">No matches drawn for this day.</div>'}`
  } else if (r.kind === 'teams') {
    const lead = r.totals.A === r.totals.B ? null : r.totals.A > r.totals.B ? A : B
    body = `<div class="card evscore"><div class="evteams">
        <div><span class="tn" style="color:${A.col}">${esc(A.name)}</span><span class="tp" style="color:${A.col}">${r.totals.A} <small>pts</small></span></div>
        <div class="r"><span class="tn" style="color:${B.col}">${esc(B.name)}</span><span class="tp" style="color:${B.col}">${r.totals.B} <small>pts</small></span></div></div>
        <div class="evfoot">${lead ? `${esc(lead.name)} lead by ${Math.abs(r.totals.A - r.totals.B)}` : r.totals.A ? 'All square' : 'Not started'}</div></div>
      <div class="card list">${r.players.map(p => `<div class="lrow${p.id === me.id ? ' me' : ''}"><span class="av" style="border-color:${(p.team === 'A' ? A : B).col}">${ini(p.name)}</span><span class="who"><strong>${esc(p.name)}${p.id === me.id ? ' (you)' : ''}</strong><small>${esc((p.team === 'A' ? A : B).name)} · ${thruText(p.perDay[day - 1].thru, p.perDay[day - 1].of)}${e.days > 1 ? ` today` : ''}</small></span><span class="hcp">${p.pts}<small>pts</small></span></div>`).join('')}</div>`
  } else {
    const net = e.fmt === 'net'
    body = `<div class="lblist">${r.rows.map(p => `<div class="lbrow${p.id === me.id ? ' me' : ''}${p.pos ? '' : ' wait'}"><span class="lpos">${p.pos ? `${p.tied ? 'T' : ''}${p.pos}` : '–'}</span><span class="av">${ini(p.name)}</span><span class="who"><strong>${esc(p.name)}${p.id === me.id ? ' (you)' : ''}</strong><small>${thruText(p.perDay[day - 1].thru, p.perDay[day - 1].of)}${e.days > 1 ? ` on day ${day}` : ''}</small></span><span class="lval${net && p.net < 0 ? ' under' : ''}">${p.pos ? (net ? toPar(p.net) : p.pts) : '–'}</span></div>`).join('')}</div>`
  }
  return `<div class="screen">${top}${head}${notYet ? `<div class="hcpnote">Starts ${longDay(fromIso(e.startDate))}. Scores appear here as players save holes on their cards.</div>` : ''}${body}
    <div class="hint" style="text-align:center">Scores come from each player’s own card and update as holes are saved.</div></div>`
}

const pairHtml = (names, c) => `<span class="pairav">${names.map(n => `<span class="av" style="border-color:${c}">${ini(n)}</span>`).join('')}</span><span>${names.map(n => esc(sur(n))).join('<br>')}</span>`
const TYPE_LABEL = { four: 'Four-ball', singles: 'Singles', three: '3-ball' }
const typeLabel = mt => TYPE_LABEL[mt.type] ?? 'Four-ball'
// What a win is worth: "1 pt", "2 pts"; a 3-ball "pair / single".
function ptsLabel(mt) {
  const w = mt.win ?? { A: 1, B: 1 }, n = x => fmtPts(x)
  if (mt.type !== 'three') return `${n(w.A)} pt${w.A === 1 ? '' : 's'}`
  const pairA = mt.a.length === 2
  return `${n(pairA ? w.A : w.B)} / ${n(pairA ? w.B : w.A)} pts`
}
// The match day to show: the one picked from the drop-down, else today's, else the next, else the latest.
function shownDay(e) {
  const days = matchDays(e), now = isoDate(today())
  if (S.evPick?.id === e.id && days.includes(S.evPick.day)) return S.evPick.day
  return days.find(d => dayDate(e, d) === now) ?? days.find(d => dayDate(e, d) > now) ?? days.at(-1) ?? 1
}
// The match days, to choose from: "Sat 24 Oct · 3 matches · 12 holes (next)".
function daySelect(e, r, shown) {
  const now = isoDate(today()), days = matchDays(e), next = days.find(d => dayDate(e, d) > now)
  return `<label class="hint" for="ev-mday">Match day</label><select id="ev-mday" class="plainsel">${days.map(d => {
    const n = (r.byDay[d] ?? []).length, holes = holesText(dayRules(e, d).holes) || '18 holes', iso = dayDate(e, d)
    return `<option value="${d}" ${d === shown ? 'selected' : ''}>${longDay(fromIso(iso))} · ${n} match${n === 1 ? '' : 'es'} · ${holes}${iso === now ? ' (today)' : d === next ? ' (next)' : ''}</option>` }).join('')}</select>`
}

function matchCard(data, mt, k, d) {
  const { A, B } = data.e, res = mt.res, who = res.d > 0 ? A : res.d < 0 ? B : null, col = who ? who.col : 'var(--muted)'
  const stat = res.st === 'ns' ? `<b class="ms-big">Not started</b>`
    : res.st === 'done' ? `<b class="ms-big" style="color:${col}">${who ? `${esc(who.name)} ${esc(res.txt)}` : 'Halved'}</b><small>${who ? 'Final' : `${fmtPts(mt.pts.cA)} – ${fmtPts(mt.pts.cB)} pts`}</small>`
    : `<b class="ms-big" style="color:${col}">${data.e.fmt === 'stabtot' ? `${who ? esc(who.name) : 'Level'} ${esc(res.txt)}` : res.d ? `${Math.abs(res.d)} up` : 'AS'}</b><small>thru ${res.thru} <span class="livedot">● live</span></small>`
  const mineHere = data.mine?.no === k + 1 && data.day === d
  return `<div class="card mcard tap${mineHere ? ' minem' : ''}" data-match="${k + 1}" data-mday="${d}" role="button" tabindex="0" aria-label="${typeLabel(mt)}: open its scorecard"><div class="mtitle">${mineHere ? 'Your match · ' : ''}${typeLabel(mt)} · ${ptsLabel(mt)}</div><div class="mgrid"><div class="mside">${pairHtml(mt.a, A.col)}</div><div class="mstat">${stat}</div><div class="mside r">${pairHtml(mt.b, B.col)}</div></div>${mineHere ? `<div class="mact">${matchActionHtml(data.action)}</div>` : ''}</div>`
}

// A season: the score so far, the organiser's buttons, then one match day at a time from a drop-down.
function seasonHtml(data, r) {
  const { e, me } = data, { A, B } = e, sc = r.score, now = isoDate(today()), end = seasonEnd(e)
  const all = Object.values(r.byDay).flat(), played = all.filter(m => m.res.st === 'done').length
  const wA = sc.tot ? (sc.pA / sc.tot) * 100 : 0, wB = sc.tot ? (sc.pB / sc.tot) * 100 : 0
  const days = matchDays(e), d = shownDay(e)
  return `<div class="card evscore">
      <div class="tug"><i class="ta" style="width:${wA}%;background:${A.col}"></i><i class="tb" style="width:${wB}%;background:${B.col}"></i><span class="mid"></span></div>
      <div class="evteams"><div><span class="tn" style="color:${A.col}">${esc(A.name)}</span><span class="tp" style="color:${A.col}">${fmtPts(sc.pA)}</span><small>${fmtPts(sc.cA)} confirmed</small></div>
        <div class="r"><span class="tn" style="color:${B.col}">${esc(B.name)}</span><span class="tp" style="color:${B.col}">${fmtPts(sc.pB)}</span><small>${fmtPts(sc.cB)} confirmed</small></div></div>
      <div class="evfoot">${played} match${played === 1 ? '' : 'es'} played · ${all.length - played} to come · ${end < now ? `Final · season ended ${eventDates(end, 1)}` : `Season ends ${eventDates(end, 1)}`}</div></div>
    ${canChange(e, me, now) && end >= now ? '<div class="bk-btns"><button class="ghost" id="sn-add">+ Add a match day</button><button class="ghost" id="sn-players">Add a player</button></div>' : ''}
    ${days.length ? `${daySelect(e, r, d)}${(r.byDay[d] ?? []).map((mt, k) => matchCard(data, mt, k, d)).join('')}` : '<div class="empty-state">No match days yet.</div>'}`
}

export function bindBoard(data = {}) {
  const edit = step => async () => { Object.assign(S, { ev: null, evId: data.e.id, evStep: step, evScope: data.e.club ? 'club' : 'player', aview: 'event' }); await render(); top0() }
  if (document.getElementById('sn-add')) document.getElementById('sn-add').onclick = () => { S.mdFlowNew = true; return edit(4)() }
  if (document.getElementById('sn-players')) document.getElementById('sn-players').onclick = edit(2)
  // Choosing a match day: a season redraws what it has; a one-off loads that day's booking advice for your match.
  if (document.getElementById('ev-mday')) document.getElementById('ev-mday').onchange = ev => {
    const day = +ev.target.value
    S.evPick = { id: data.e.id, day }
    if (data.e.season) keepScroll(redraw); else { S.evDay = day; keepScroll(render) }
  }
  document.querySelectorAll('[data-lgko]').forEach(b => (b.onclick = async () => { Object.assign(S, { koComp: +b.dataset.lgko, koRound: null, koFrom: S.tab === 'home' ? S.aview : null, tab: 'home', aview: 'ko' }); await render(); top0() }))
  if (document.getElementById('lg-kostart')) document.getElementById('lg-kostart').onclick = async ev => {
    const b = ev.currentTarget, e = data.e, seeds = koSeeds
    if (seeds.length < 2) { toast('Not enough players have played yet.'); return }
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = `Tap again: draw the top ${seeds.length}, seeded`; return }
    const finish = e.koFinish && e.koFinish > isoDate(today()) ? e.koFinish : addDaysIso(isoDate(today()), 56)
    try {
      const id = await api.startLeagueKnockout(e.id, seeds, spreadDates(isoDate(today()), finish, Math.ceil(Math.log2(seeds.length))))
      Object.assign(S, { koComp: id, koRound: null, koFrom: null, tab: 'home', aview: 'ko' }); await render(); top0()
    } catch (err) { toast(err.message) }
  }
  // A match opens its page (scorecard); your match also carries its action (book / add / score).
  document.querySelectorAll('[data-match]').forEach(c => {
    c.onclick = async () => { Object.assign(S, { evId: data.e.id, matchNo: +c.dataset.match, matchDay: c.dataset.mday ? +c.dataset.mday : data.day, matchFrom: S.tab === 'home' ? S.aview : null, tab: 'home', aview: 'match' }); await render(); top0() }
    c.onkeydown = ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target === c) { ev.preventDefault(); c.click() } }
  })
  if (data.action) bindMatchAction(data.action)
  document.querySelectorAll('[data-lgview]').forEach(b => (b.onclick = () => { S.lgView = b.dataset.lgview; keepScroll(redraw) }))
  document.querySelectorAll('[data-lgweek]').forEach(b => (b.onclick = () => { S.lgWeek = b.dataset.lgweek === 'season' ? 'season' : +b.dataset.lgweek; keepScroll(redraw) }))
  // Remember which teams are open between redraws.
  document.querySelectorAll('[data-lgteam]').forEach(d => d.addEventListener('toggle', () => { const k = +d.dataset.lgteam; d.open ? S.lgOpen.add(k) : S.lgOpen.delete(k) }))
  const all = document.getElementById('lg-all')
  if (all) all.onclick = () => {
    const teams = [...document.querySelectorAll('[data-lgteam]')].map(d => +d.dataset.lgteam)
    S.lgOpen = S.lgOpen.size === teams.length ? new Set() : new Set(teams)
    keepScroll(redraw)
  }
}

// A league: team table (season or one week) and an individual table.
function leagueHtml({ e, members, course, L, entries, cards, me }, top) {
  const tee = teeRating(course), m = id => members.find(x => x.id === id)
  const player = id => ({ name: m(id)?.name ?? 'Former member', courseHcp: courseHandicap(m(id)?.hcp ?? 0, tee) })
  const g = L.lib.stab, allow = g?.pct == null ? 1 : g.pct / 100
  const mine = entries.filter(x => x.eventId === e.id)
  if (Array.isArray(e.leaguePairs)) return pairsLeagueHtml(e, scorePairsLeague(e, course.holes, mine, cards, player, allow), me, top)
  const r = scoreLeague(e, course.holes, mine, cards, player, allow)
  if (!e.teams?.length) S.lgView = 'individual' // a member's league: just its players
  const now = Math.min(e.weeks, leagueWeek(e, isoDate(today())))
  const wk = S.lgWeek === 'season' || !S.lgWeek ? 'season' : Math.min(S.lgWeek, e.weeks)
  const view = S.lgView === 'individual' ? 'individual' : 'teams'
  const weekDates = w => `${eventDates(addDaysIso(e.startDate, (w - 1) * 7), 1)} – ${eventDates(addDaysIso(e.startDate, w * 7 - 1), 1)}`
  const chips = `<div class="tabs-pill" role="group" aria-label="Week"><button data-lgweek="season" aria-pressed="${wk === 'season'}">Season</button>${Array.from({ length: e.weeks }, (_, i) => `<button data-lgweek="${i + 1}" aria-pressed="${wk === i + 1}">Wk ${i + 1}${i + 1 === now ? ' ●' : ''}</button>`).join('')}</div>`
  const seg = `<div class="seg" role="group"><button data-lgview="teams" aria-pressed="${view === 'teams'}">Teams</button><button data-lgview="individual" aria-pressed="${view === 'individual'}">Individual</button></div>`
  const myTeam = e.team[me.id]
  let body
  if (view === 'teams') {
    const rows = wk === 'season' ? r.teams : [...r.teams].sort((a, b) => b.perWeek[wk - 1].score - a.perWeek[wk - 1].score)
    const byId = new Map(r.players.map(p => [p.id, p]))
    S.lgOpen ??= new Set(myTeam != null ? [myTeam] : [])
    let pos = 0, prev = null
    body = `<div class="lgteams">${rows.map((t, i) => {
      const v = wk === 'season' ? t.total : t.perWeek[wk - 1].score
      if (v !== prev) { pos = i + 1; prev = v }
      const w = wk === 'season' ? null : t.perWeek[wk - 1]
      const members = Object.keys(e.team).map(Number).filter(id => e.team[id] === t.idx).map(id => byId.get(id)).filter(Boolean)
      const sub = wk === 'season' ? `${t.perWeek.filter(x => x.entered).length} of ${e.weeks} weeks played · ${members.length} player${members.length === 1 ? '' : 's'}`
        : `${w.entered} entered · best ${Math.min(e.bestOf, w.entered)} count${w.live ? ' <span class="livedot">● live</span>' : ''}`
      // Players: this week's points (counting scores highlighted), or season points and how often they counted.
      const list = members.map(p => {
        if (wk === 'season') {
          const counted = t.perWeek.filter(x => x.counting.includes(p.id)).length
          return { p, v: p.total, has: p.rounds > 0, counts: false, note: p.rounds ? `${p.rounds} round${p.rounds === 1 ? '' : 's'} · counted ${counted}×` : 'no rounds yet' }
        }
        const pw = p.perWeek[wk]
        return { p, v: pw ? pw.pts : null, has: !!pw, counts: w.counting.includes(p.id), note: pw ? (pw.done ? 'Finished' : `thru ${pw.thru} <span class="livedot">● live</span>`) : 'not entered' }
      }).sort((a, b) => b.has - a.has || (b.v ?? 0) - (a.v ?? 0) || a.p.name.localeCompare(b.p.name))
      return `<details class="lgteam${t.idx === myTeam ? ' me' : ''}" data-lgteam="${t.idx}" ${S.lgOpen.has(t.idx) ? 'open' : ''}>
        <summary class="lbrow"><span class="lpos">${pos}</span><span class="av" style="border-color:${t.col}">${ini(t.name)}</span><span class="who"><strong>${esc(t.name)}${t.idx === myTeam ? ' (your team)' : ''}</strong><small>${sub}</small></span><span class="lval">${v}</span></summary>
        <div class="lgplayers">${list.map(x => `<div class="lgp${x.counts ? ' counts' : ''}${x.has ? '' : ' none'}${x.p.id === me.id ? ' mine' : ''}"><span class="who"><strong>${esc(x.p.name)}${e.teams[t.idx]?.captain === x.p.id ? ' <span class="pill tag">Captain</span>' : ''}${x.p.id === me.id ? ' (you)' : ''}</strong><small>${x.note}</small></span>${x.counts ? '<span class="cnt">counts</span>' : ''}<b>${x.v ?? '–'}</b></div>`).join('') || '<div class="hint">No players yet.</div>'}</div>
      </details>`
    }).join('')}</div>
    <div class="hint">${wk === 'season' ? 'Tap a team to see its players’ season points.' : `Tap a team to see its players. Highlighted scores are the best ${e.bestOf} that count this week.`} <button class="linkbtn" id="lg-all">${S.lgOpen.size === r.teams.length ? 'Close all' : 'Open all'}</button></div>`
  } else {
    const rows = r.players.filter(p => (wk === 'season' ? p.rounds : p.perWeek[wk]))
      .map(p => ({ ...p, v: wk === 'season' ? p.total : p.perWeek[wk].pts, thru: wk === 'season' ? null : p.perWeek[wk].thru, done: wk !== 'season' && p.perWeek[wk].done }))
      .sort((a, b) => b.v - a.v)
    let pos = 0, prev = null
    body = rows.length ? `<div class="lblist">${rows.map((p, i) => {
      if (p.v !== prev) { pos = i + 1; prev = p.v }
      const t = e.teams[p.team]
      return `<div class="lbrow${p.id === me.id ? ' me' : ''}"><span class="lpos">${pos}</span><span class="av" style="border-color:${t?.col}">${ini(p.name)}</span><span class="who"><strong>${esc(p.name)}${p.id === me.id ? ' (you)' : ''}</strong><small>${esc(t?.name ?? '')} · ${wk === 'season' ? `${p.rounds} round${p.rounds === 1 ? '' : 's'}` : p.done ? 'Finished' : `thru ${p.thru} <span class="livedot">● live</span>`}</small></span><span class="lval">${p.v}</span></div>`
    }).join('')}</div>` : '<div class="empty-state">No rounds entered yet.</div>'
  }
  const notYet = now === 0
  return `<div class="screen">${top}
    <div class="matchline"><b style="color:var(--ink)">League · best ${e.bestOf} Stableford rounds a week</b><span>${e.weeks} weeks · ${wk === 'season' ? `${eventDates(e.startDate, 1)} – ${eventDates(addDaysIso(e.startDate, e.weeks * 7 - 1), 1)}` : `Week ${wk}: ${weekDates(wk)}`}</span></div>
    ${notYet ? `<div class="hcpnote">Starts ${longDay(fromIso(e.startDate))}. Players enter a round from their scorecard before they tee off.</div>` : ''}
    ${e.teams?.length ? seg : ''}${chips}${body}
    ${koFinishHtml(e, me, leagueSeeds(e, r))}
    <div class="hint" style="text-align:center">Players enter one round a week from their scorecard, before the first hole. Points update as holes are saved.</div></div>`
}

// As an Admin → Events screen (View / Results).
export const load = () => loadBoard(S.evId)
export function draw(data) {
  const back = () => { S.evDay = null; return goBack(async () => { S.aview = 'comp'; await render(); top0() }) } // the way you came
  if (!data.e) { header('Event', '', back); $('main').innerHTML = '<div class="screen"><div class="empty-state">This event is no longer available.</div></div>'; return }
  header(esc(data.e.name), `${data.e.players.length} player${data.e.players.length === 1 ? '' : 's'}`, back)
  $('main').innerHTML = boardHtml(data)
  bindBoard(data)
}

// A pairs league: the pairs table (season total, or one week), and the knockout finish.
function pairsLeagueHtml(e, rows, me, top) {
  const now = Math.min(e.weeks, leagueWeek(e, isoDate(today())))
  const wk = S.lgWeek === 'season' || !S.lgWeek ? 'season' : Math.min(S.lgWeek, e.weeks)
  const chips = `<div class="tabs-pill" role="group" aria-label="Week"><button data-lgweek="season" aria-pressed="${wk === 'season'}">Season</button>${Array.from({ length: e.weeks }, (_, i) => `<button data-lgweek="${i + 1}" aria-pressed="${wk === i + 1}">Wk ${i + 1}</button>`).join('')}</div>`
  const list = wk === 'season' ? rows : rows.filter(p => p.perWeek[wk]).map(p => ({ ...p, v: p.perWeek[wk].pts })).sort((a, b) => b.v - a.v)
  const sur = n => n.split(' ').slice(-1)[0]
  const body = list.length ? `<div class="lblist">${list.map((p, i) => `<div class="lbrow${p.pair.includes(me.id) ? ' me' : ''}"><span class="lpos">${wk === 'season' ? `${p.tied ? 'T' : ''}${p.pos}` : i + 1}</span>
      <span class="who"><strong>${esc(sur(p.names[0]))} & ${esc(sur(p.names[1]))}</strong><small>${wk === 'season' ? `${p.rounds} of ${e.weeks} weeks together` : p.perWeek[wk].done ? 'Finished' : `thru ${p.perWeek[wk].thru}`}</small></span>
      <span class="hcp">${wk === 'season' ? p.total : p.v}<small>pts</small></span></div>`).join('')}</div>` : '<div class="empty-state">No pairs have played together yet.</div>'
  return `<div class="screen">${top}
    <div class="matchline"><b style="color:var(--ink)">Pairs league · better-ball Stableford</b><span>${e.weeks} weeks · week ${Math.max(1, now)}</span></div>
    ${chips}${body}
    ${koFinishHtml(e, me, leagueSeeds(e, { pairs: rows }))}
    <div class="hint" style="text-align:center">A pair’s week counts when they play together on one card and both enter it. Their better ball, hole by hole.</div></div>`
}

// The knockout finish: what it is, Start the knockout (organiser, after the last week), or the draw once started.
let koSeeds = [] // the qualifiers in table order, for Start the knockout
function koFinishHtml(e, me, seeds) {
  koSeeds = seeds
  if (!e.koTop) return ''
  if (e.koComp) return `<button class="card comp gold" data-lgko="${e.koComp}"><span class="row"><span class="ct">The knockout</span><span class="link">Draw ›</span></span><span class="sub">Top ${e.koTop} from the table · seeded</span></button>`
  const over = leagueWeek(e, isoDate(today())) > e.weeks, organiser = me.admin || e.createdBy?.id === me.id
  return `<div class="card evsec"><b>Knockout finish</b><span class="hint">After week ${e.weeks}, the top ${e.koTop} go into a knockout, seeded from the table${e.koFinish ? `; the final by ${eventDates(e.koFinish, 1)}` : ''}.</span>
    ${organiser ? `<button class="primary" id="lg-kostart" ${over || me.admin ? '' : 'disabled'}>${over ? `Start the knockout (${Math.min(seeds.length, e.koTop)} qualifiers)` : me.admin ? 'Start the knockout now' : `Starts after week ${e.weeks}`}</button>` : ''}</div>`
}
