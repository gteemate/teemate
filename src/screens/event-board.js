// The board for an event set up in advance, scored live from each player's own card on each day.
// Shown on the Leaderboard tab while it's on, and from Admin → Events (View / Results).
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, sur, header, keepScroll, render, top0 } from '../ui.js'
import { courseHandicap, fmtPts, toPar } from '../scoring.js'
import { scoreAdvanceEvent } from '../event-scoring.js'
import { buildLibrary, teeRating, EVENT_ALLOWANCE_GAME } from '../games.js'
import { addDaysIso, eventDates, isoDate, today, fromIso, longDay } from '../dates.js'
import { EVENT_TYPES, eventFormat } from './event-editor.js'

export async function loadBoard(id) {
  const [events, members, course, games] = await Promise.all([api.getEvents(), api.getMembers(), api.getCourse(), api.getGameSettings()])
  const e = events.find(x => x.id === id)
  if (!e) return { e: null }
  const dates = Array.from({ length: e.days }, (_, i) => addDaysIso(e.startDate, i))
  const cards = await api.getCardsOn(dates)
  const dayCards = Object.fromEntries(dates.map((d, i) => [i + 1, cards.filter(c => c.date === d)]))
  return { e, members, course, L: buildLibrary(games), dayCards, me: await api.getMe() }
}

/** Which day of the event today is (1-based), clamped to the event's days. */
export const dayOf = e => Math.min(e.days, Math.max(1, Math.round((fromIso(isoDate(today())) - fromIso(e.startDate)) / 864e5) + 1))

export function boardHtml({ e, members, course, L, dayCards, me }, top = '') {
  const tee = teeRating(course)
  const m = id => members.find(x => x.id === id)
  const player = id => ({ name: m(id)?.name ?? 'Former member', courseHcp: courseHandicap(m(id)?.hcp ?? 0, tee) })
  const g = L.lib[EVENT_ALLOWANCE_GAME[e.fmt]]
  const r = scoreAdvanceEvent(e, course.holes, dayCards, player, g?.pct == null ? 0 : g.pct / 100)
  const day = Math.min(S.evDay || dayOf(e), e.days)
  const thruText = n => (n === 18 ? 'Finished' : n ? `thru ${n}` : 'not started')
  const notYet = e.startDate > isoDate(today())
  const head = `<div class="matchline"><b style="color:var(--ink)">${EVENT_TYPES[e.style].name}${e.style !== 'teams' ? ` · ${eventFormat(e)}` : ''}</b><span>${eventDates(e.startDate, e.days)}${e.club ? ' · club event' : ''}</span></div>`
  const dayTabs = e.days > 1 ? `<div class="tabs-pill" role="group" aria-label="Day">${Array.from({ length: e.days }, (_, i) => `<button data-evday="${i + 1}" aria-pressed="${day === i + 1}">Day ${i + 1} · ${longDay(fromIso(addDaysIso(e.startDate, i))).split(' ').slice(0, 2).join(' ')}</button>`).join('')}</div>` : ''
  const A = e.A, B = e.B
  let body = ''

  if (r.kind === 'ryder') {
    const sc = r.score, wA = sc.tot ? (sc.pA / sc.tot) * 100 : 0, wB = sc.tot ? (sc.pB / sc.tot) * 100 : 0
    const matches = r.byDay[day] ?? []
    body = `<div class="card evscore">
        <div class="tug"><i class="ta" style="width:${wA}%;background:${A.col}"></i><i class="tb" style="width:${wB}%;background:${B.col}"></i><span class="mid"></span></div>
        <div class="evteams"><div><span class="tn" style="color:${A.col}">${esc(A.name)}</span><span class="tp" style="color:${A.col}">${fmtPts(sc.pA)} <small>projected</small></span><small>${fmtPts(sc.cA)} confirmed</small></div>
          <div class="r"><span class="tn" style="color:${B.col}">${esc(B.name)}</span><span class="tp" style="color:${B.col}">${fmtPts(sc.pB)} <small>projected</small></span><small>${fmtPts(sc.cB)} confirmed</small></div></div>
        <div class="evfoot">${fmtPts(sc.toWin)} to win · ${sc.tot} point${sc.tot === 1 ? '' : 's'} available</div></div>
      ${dayTabs}
      ${matches.map((mt, k) => {
        const res = mt.res, who = res.d > 0 ? A : res.d < 0 ? B : null, col = who ? who.col : 'var(--muted)'
        const stat = res.st === 'ns' ? `<b class="ms-big">Not started</b>`
          : res.st === 'done' ? `<b class="ms-big" style="color:${col}">${who ? `${esc(who.name)} ${esc(res.txt)}` : 'Halved'}</b><small>${who ? 'Final' : '½ point each'}</small>`
          : `<b class="ms-big" style="color:${col}">${res.d ? `${Math.abs(res.d)} up` : 'AS'}</b><small>thru ${res.thru} <span class="livedot">● live</span></small>`
        const pair = (names, c) => `<span class="pairav">${names.map(n => `<span class="av" style="border-color:${c}">${ini(n)}</span>`).join('')}</span><span>${names.map(n => esc(sur(n))).join('<br>')}</span>`
        return `<div class="card mcard"><div class="mtitle">Match ${k + 1}</div><div class="mgrid"><div class="mside">${pair(mt.a, A.col)}</div><div class="mstat">${stat}</div><div class="mside r">${pair(mt.b, B.col)}</div></div></div>`
      }).join('') || '<div class="empty-state">No matches drawn for this day.</div>'}`
  } else if (r.kind === 'teams') {
    const lead = r.totals.A === r.totals.B ? null : r.totals.A > r.totals.B ? A : B
    body = `<div class="card evscore"><div class="evteams">
        <div><span class="tn" style="color:${A.col}">${esc(A.name)}</span><span class="tp" style="color:${A.col}">${r.totals.A} <small>pts</small></span></div>
        <div class="r"><span class="tn" style="color:${B.col}">${esc(B.name)}</span><span class="tp" style="color:${B.col}">${r.totals.B} <small>pts</small></span></div></div>
        <div class="evfoot">${lead ? `${esc(lead.name)} lead by ${Math.abs(r.totals.A - r.totals.B)}` : r.totals.A ? 'All square' : 'Not started'}</div></div>
      <div class="card list">${r.players.map(p => `<div class="lrow${p.id === me.id ? ' me' : ''}"><span class="av" style="border-color:${(p.team === 'A' ? A : B).col}">${ini(p.name)}</span><span class="who"><strong>${esc(p.name)}${p.id === me.id ? ' (you)' : ''}</strong><small>${esc((p.team === 'A' ? A : B).name)} · ${thruText(p.perDay[day - 1].thru)}${e.days > 1 ? ` today` : ''}</small></span><span class="hcp">${p.pts}<small>pts</small></span></div>`).join('')}</div>`
  } else {
    const net = e.fmt === 'net'
    body = `<div class="lblist">${r.rows.map(p => `<div class="lbrow${p.id === me.id ? ' me' : ''}${p.pos ? '' : ' wait'}"><span class="lpos">${p.pos ? `${p.tied ? 'T' : ''}${p.pos}` : '–'}</span><span class="av">${ini(p.name)}</span><span class="who"><strong>${esc(p.name)}${p.id === me.id ? ' (you)' : ''}</strong><small>${thruText(p.perDay[day - 1].thru)}${e.days > 1 ? ` on day ${day}` : ''}</small></span><span class="lval${net && p.net < 0 ? ' under' : ''}">${p.pos ? (net ? toPar(p.net) : p.pts) : '–'}</span></div>`).join('')}</div>`
  }
  return `<div class="screen">${top}${head}${notYet ? `<div class="hcpnote">Starts ${longDay(fromIso(e.startDate))}. Scores appear here as players save holes on their cards.</div>` : ''}${body}
    <div class="hint" style="text-align:center">Scores come from each player’s own card and update as holes are saved.</div></div>`
}

export function bindBoard() {
  document.querySelectorAll('[data-evday]').forEach(b => (b.onclick = () => { S.evDay = +b.dataset.evday; keepScroll(render) }))
}

// As an Admin → Events screen (View / Results).
export const load = () => loadBoard(S.evId)
export function draw(data) {
  const back = async () => { S.aview = 'events'; S.evDay = null; await render(); top0() }
  if (!data.e) { header('Event', '', back); $('main').innerHTML = '<div class="screen"><div class="empty-state">This event is no longer available.</div></div>'; return }
  header(esc(data.e.name), `${data.e.players.length} players`, back)
  $('main').innerHTML = boardHtml(data)
  bindBoard()
}
