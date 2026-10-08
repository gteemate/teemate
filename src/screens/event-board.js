// Leaderboard → team event: points tug-of-war and each day's matches.
import { S } from '../state.js'
import { $, esc, ini, sur, header, keepScroll, render } from '../ui.js'
import { teamEventScore, fmtPts } from '../scoring.js'
import { lbSeg, bindLbSeg } from './leaderboard.js'

const allMatches = e => Object.values(e.matches).flat()

function matchStatus(e, m) {
  const r = m.res, lead = r.d > 0 ? e.A : r.d < 0 ? e.B : null
  if (r.st === 'ns') return `<b class="ms-big">Not started</b><small>Tee ${m.tee}</small>`
  if (r.st === 'done') return `<b class="ms-big" style="color:${lead ? lead.col : 'var(--muted)'}">${lead ? `${esc(lead.name)} ${esc(r.txt)}` : 'Halved'}</b><small>${lead ? 'Final' : '½ point each'}</small>`
  return `<b class="ms-big" style="color:${lead ? lead.col : 'var(--ink)'}">${r.d ? `${Math.abs(r.d)} up` : 'AS'}</b><small>thru ${r.thru} <span class="livedot">● live</span></small>`
}

export function draw({ event: e, members }) {
  const byId = id => members.find(m => m.id === id)
  const pairAv = (ids, col) => `<span class="pairav">${ids.map(id => `<span class="av" style="border-color:${col}">${ini(byId(id).name)}</span>`).join('')}</span>`
  const sc = teamEventScore(allMatches(e)), day = Math.min(S.evDay, e.days), ms = e.matches[day] || []
  header(esc(e.name), `${esc(e.format)} · ${sc.tot} matches`)
  const wA = sc.tot ? (sc.pA / sc.tot) * 100 : 0, wB = sc.tot ? (sc.pB / sc.tot) * 100 : 0
  const perDay = [...Array(e.days)].map((_, d) => `Day ${d + 1}: ${(e.matches[d + 1] || []).length}`).join(' · ')
  $('main').innerHTML = `<div class="screen">${lbSeg(e)}
   <div class="card evscore">
     <div class="tug"><i class="ta" style="width:${wA}%;background:${e.A.col}"></i><i class="tb" style="width:${wB}%;background:${e.B.col}"></i><span class="mid"></span></div>
     <div class="evteams"><div><span class="tn" style="color:${e.A.col}">${esc(e.A.name)}</span><span class="tp" style="color:${e.A.col}">${fmtPts(sc.pA)} <small>projected</small></span><small>${fmtPts(sc.cA)} confirmed</small></div>
       <div class="r"><span class="tn" style="color:${e.B.col}">${esc(e.B.name)}</span><span class="tp" style="color:${e.B.col}">${fmtPts(sc.pB)} <small>projected</small></span><small>${fmtPts(sc.cB)} confirmed</small></div></div>
     <div class="evfoot">${fmtPts(sc.toWin)} to win · ${sc.tot} points available<br><small>${perDay}</small></div></div>
   <div class="tabs-pill" role="group" aria-label="Day">${[...Array(e.days)].map((_, d) => `<button data-ed="${d + 1}" aria-pressed="${day === d + 1}">Day ${d + 1}</button>`).join('')}</div>
   <div class="matchline"><b style="color:var(--ink)">${esc(e.course)}</b><span>${ms.filter(m => m.res.st === 'done').length} of ${ms.length} matches completed</span></div>
   ${ms.length ? ms.map((m, n) => `<div class="card mcard"><div class="mtitle">Match ${n + 1}</div><div class="mgrid">
     <div class="mside">${pairAv(m.a, e.A.col)}<span>${m.a.map(id => esc(sur(byId(id).name))).join('<br>')}</span></div>
     <div class="mstat">${matchStatus(e, m)}</div>
     <div class="mside r">${pairAv(m.b, e.B.col)}<span>${m.b.map(id => esc(sur(byId(id).name))).join('<br>')}</span></div></div></div>`).join('') : `<div class="empty-state">No matches drawn for Day ${day} yet. Set them up in Admin → Events.</div>`}
  </div>`
  bindLbSeg()
  document.querySelectorAll('[data-ed]').forEach(b => (b.onclick = () => { S.evDay = +b.dataset.ed; keepScroll(render) }))
}
