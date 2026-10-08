// Scores → a player event's live board. Everyone in the event sees every group's score, worked out
// from each group's own card (the card started from that tee time). Refreshes every 30 seconds.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, header, render, top0 } from '../ui.js'
import { fmtPts } from '../scoring.js'
import { scorePlayerEvent, buildEventGroups } from '../event-scoring.js'
import { buildLibrary, teeRating, EVENT_ALLOWANCE_GAME } from '../games.js'
import { hhmm } from '../dates.js'
import { eventTitle, eventSubtitle, myGroup } from './player-events.js'

export async function load() {
  const [events, course, members, games, me] = await Promise.all([api.getMyPlayerEvents(), api.getCourse(), api.getMembers(), api.getGameSettings(), api.getMe()])
  const e = events.find(x => x.id === S.peId)
  if (!e) return { e: null }
  const [cards, guests] = await Promise.all([
    api.getCardsForTeeTimes(e.date, e.groups.map(g => g.slot)),
    api.getGuests(e.players.filter(p => p.guest).map(p => p.id)),
  ])
  return { e, course, members, guests, cards, L: buildLibrary(games), me }
}

let timer
export function draw({ e, course, members, guests, cards, L, me }) {
  clearTimeout(timer)
  const back = async () => { clearTimeout(timer); S.sview = 'card'; await render(); top0() }
  if (!e) { header('Event', '', back); $('main').innerHTML = '<div class="screen"><div class="empty-state">This event is no longer available.</div></div>'; return }
  header(eventTitle(e), eventSubtitle(e), back)
  const indexOf = p => (p.guest ? guests.find(x => x.id === p.id)?.hcp : members.find(m => m.id === p.memberId)?.hcp)
  const groups = buildEventGroups(e, course.holes, teeRating(course), cards, indexOf, g => hhmm(g.time))
  const g = L.lib[EVENT_ALLOWANCE_GAME[e.format]]
  const allow = g?.pct == null ? 0 : g.pct / 100
  const r = scorePlayerEvent(e, course.holes, groups, allow)
  const mine = String(myGroup(e, me.id)?.slot)
  const thruText = n => (n === 18 ? 'Finished' : n ? `thru ${n}` : 'not started')
  const noCard = groups.filter(x => !x.hasCard)

  let body = ''
  if (r.kind === 'table') {
    body = `<div class="lblist">${r.rows.map(row => `<div class="lbrow${row.key === mine ? ' me' : ''}"><span class="lpos">${row.tied ? 'T' : ''}${row.pos}</span><span class="av">${hhmm(groups.find(x => x.key === row.key).time).replace(':', '')}</span>
      <span class="who"><strong>${esc(row.name)}${row.key === mine ? ' (your group)' : ''}</strong><small>${groups.find(x => x.key === row.key).players.map(p => esc(p.name.split(' ').slice(-1)[0])).join(', ')} · ${thruText(row.thru)}</small></span><span class="lval">${row.total}<small style="font-size:12px;color:var(--muted)"> pts</small></span></div>`).join('')}</div>`
  } else if (r.kind === 'match') {
    const [ga, gb] = groups, lead = r.lead === 'A' ? ga : r.lead === 'B' ? gb : null
    body = `<div class="status"><div class="side">${esc(ga.name)}<br><small>${thruText(r.ahead.A)}</small></div>
      <div class="big">${r.thru ? (lead ? `${esc(lead.name)}<br>${r.over ? `win ${r.text}` : r.text}` : r.text) : 'Not started'}<small>${r.thru && !r.finished ? `thru ${r.thru} (both groups)` : r.finished ? 'Final' : ''}</small></div>
      <div class="side">${esc(gb.name)}<br><small>${thruText(r.ahead.B)}</small></div></div>
      <div class="hint">Each hole goes to the lowest net score in either group, with shots off the lowest handicap across both. A hole counts once both groups have played it.</div>`
  } else if (r.kind === 'ryder') {
    const sc = r.score, wA = sc.tot ? (sc.pA / sc.tot) * 100 : 0, wB = sc.tot ? (sc.pB / sc.tot) * 100 : 0
    body = `<div class="card evscore">
        <div class="tug"><i class="ta" style="width:${wA}%;background:var(--green)"></i><i class="tb" style="width:${wB}%;background:var(--loss)"></i><span class="mid"></span></div>
        <div class="evteams"><div><span class="tn" style="color:var(--green)">${esc(e.teamNames.A)}</span><span class="tp" style="color:var(--green)">${fmtPts(sc.pA)} <small>projected</small></span><small>${fmtPts(sc.cA)} confirmed</small></div>
          <div class="r"><span class="tn" style="color:var(--loss)">${esc(e.teamNames.B)}</span><span class="tp" style="color:var(--loss)">${fmtPts(sc.pB)} <small>projected</small></span><small>${fmtPts(sc.cB)} confirmed</small></div></div>
        <div class="evfoot">${fmtPts(sc.toWin)} to win · ${sc.tot} point${sc.tot > 1 ? 's' : ''} available</div></div>
      ${r.matches.map(m => {
        const res = m.res, who = res.d > 0 ? e.teamNames.A : res.d < 0 ? e.teamNames.B : null, col = res.d > 0 ? 'var(--green)' : res.d < 0 ? 'var(--loss)' : 'var(--muted)'
        const stat = res.st === 'ns' ? '<b class="ms-big">Not started</b>'
          : res.st === 'done' ? `<b class="ms-big" style="color:${col}">${who ? `${esc(who)} ${esc(res.txt)}` : 'Halved'}</b><small>${who ? 'Final' : '½ point each'}</small>`
          : `<b class="ms-big" style="color:${col}">${res.d ? `${Math.abs(res.d)} up` : 'AS'}</b><small>thru ${res.thru} <span class="livedot">● live</span></small>`
        return `<div class="card mcard${m.key === mine ? ' mine' : ''}"><div class="mtitle">${hhmm(groups.find(x => x.key === m.key).time)}${m.key === mine ? ' · your group' : ''}</div><div class="mgrid">
          <div class="mside"><span class="pairav">${m.a.map(n => `<span class="av" style="border-color:var(--green)">${ini(n)}</span>`).join('')}</span><span>${m.a.map(esc).join('<br>')}</span></div>
          <div class="mstat">${stat}</div>
          <div class="mside r"><span class="pairav">${m.b.map(n => `<span class="av" style="border-color:var(--loss)">${ini(n)}</span>`).join('')}</span><span>${m.b.map(esc).join('<br>')}</span></div></div></div>`
      }).join('')}`
  } else {
    const lead = r.totals.A === r.totals.B ? null : r.totals.A > r.totals.B ? 'A' : 'B'
    body = `<div class="card evscore"><div class="evteams">
        <div><span class="tn" style="color:var(--green)">${esc(e.teamNames.A)}</span><span class="tp" style="color:var(--green)">${r.totals.A} <small>pts</small></span></div>
        <div class="r"><span class="tn" style="color:var(--loss)">${esc(e.teamNames.B)}</span><span class="tp" style="color:var(--loss)">${r.totals.B} <small>pts</small></span></div></div>
        <div class="evfoot">${lead ? `${esc(e.teamNames[lead])} lead by ${Math.abs(r.totals.A - r.totals.B)}` : 'All square'}</div></div>
      <div class="card list">${r.players.map(p => `<div class="lrow"><span class="av" style="border-color:${p.team === 'A' ? 'var(--green)' : 'var(--loss)'}">${ini(p.name)}</span><span class="who"><strong>${esc(p.name)}</strong><small>${esc(e.teamNames[p.team])} · ${esc(p.group)} · ${thruText(p.thru)}</small></span><span class="hcp">${p.pts}<small>pts</small></span></div>`).join('')}</div>`
  }

  $('main').innerHTML = `<div class="screen">
    ${body}
    ${noCard.length ? `<div class="hcpnote">${noCard.map(x => hhmm(x.time)).join(', ')} ${noCard.length > 1 ? 'haven’t' : 'hasn’t'} started a card from their tee time yet. Their scores appear here as soon as they do.</div>` : ''}
    <div class="hint" style="text-align:center">Scores come from each group’s card and update as holes are saved. <button class="linkbtn" id="pe-refresh">Refresh</button></div>
  </div>`
  $('pe-refresh').onclick = () => render()
  timer = setTimeout(() => { if (S.tab === 'scores' && S.sview === 'pevent') render() }, 30000)
}
