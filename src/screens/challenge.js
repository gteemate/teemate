// Scores → Play an event with another group: pick their tee time, team style, format and teams, then invite.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, keepScroll, top0, render, toast } from '../ui.js'
import { EVENT_STYLES, EVENT_FORMATS } from '../games.js'
import { fromIso, isoDate, longDay, hhmm, today } from '../dates.js'

export async function load() {
  S.pe ??= freshDraft()
  const [me, bookings] = await Promise.all([api.getMe(), api.getMyBookings()])
  const dates = [...new Set(bookings.map(b => b.date))].sort()
  const d = S.pe.date && dates.includes(S.pe.date) ? S.pe.date : dates[0]
  const sheet = d ? await api.getTeeSheet(d) : []
  return { me, dates, date: d, sheet }
}

const back = async () => { S.sview = 'card'; await render(); top0() }

export function draw({ me, dates, date, sheet }) {
  header('Play an event', 'Challenge another group on your day', back)
  if (!date) {
    $('main').innerHTML = '<div class="screen"><div class="empty-state">Book a tee time first. You can challenge another group playing the same day.</div></div>'
    return
  }
  const pe = S.pe
  pe.date = date
  const mine = sheet.filter(s => s.players.some(p => p.memberId === me.id))
  if (!mine.some(s => s.id === pe.slotA)) pe.slotA = mine[0]?.id
  const a = sheet.find(s => s.id === pe.slotA)
  const others = sheet.filter(s => s.id !== pe.slotA && s.players.length >= 2 && s.players.some(p => p.memberId))
  if (!others.some(s => s.id === pe.slotB)) pe.slotB = null
  const b = sheet.find(s => s.id === pe.slotB)
  const ryderOK = a?.players.length === 4 && b?.players.length === 4
  if (pe.style === 'ryder' && b && !ryderOK) pe.style = 'fourball'
  if (!EVENT_FORMATS[pe.style].some(f => f.k === pe.format)) pe.format = EVENT_FORMATS[pe.style][0].k
  // Default names: the tee times for four-ball v four-ball, colours for Ryder Cup.
  const defaults = pe.style === 'ryder' ? { A: 'Blues', B: 'Reds' } : { A: a ? hhmm(a.time) : 'Us', B: b ? hhmm(b.time) : 'Them' }
  if (!pe.namesEdited) pe.names = defaults
  // Ryder Cup teams: in each four-ball, the first two players booked start on team A.
  if (pe.style === 'ryder' && a && b) {
    for (const s of [a, b]) s.players.forEach((p, i) => { pe.teams[p.id] ??= i < 2 ? 'A' : 'B' })
  }
  const countA = s => s.players.filter(p => pe.teams[p.id] === 'A').length
  const teamsOK = pe.style !== 'ryder' || (a && b && countA(a) === 2 && countA(b) === 2)
  const names = s => s.players.map(p => esc(p.memberId === me.id ? 'You' : p.name) + (p.guest ? ' (guest)' : '')).join(', ')

  $('main').innerHTML = `<div class="screen">
    ${dates.length > 1 ? `<div class="tabs-pill" role="group" aria-label="Day">${dates.map(d => `<button data-day="${d}" aria-pressed="${d === date}">${d === isoDate(today()) ? 'Today' : longDay(fromIso(d))}</button>`).join('')}</div>` : `<div class="hint">${longDay(fromIso(date))}</div>`}
    <h3>Your group</h3>
    ${mine.map(s => `<button class="card evrow" data-a="${s.id}" aria-pressed="${s.id === pe.slotA}"><span class="who"><strong>${hhmm(s.time)}</strong><small>${names(s)}</small></span>${mine.length > 1 ? `<span class="check">${s.id === pe.slotA ? '✓' : ''}</span>` : ''}</button>`).join('')}
    <h3>Challenge</h3>
    ${others.length ? `<div class="pick">${others.map(s => `<button class="brow" data-b="${s.id}" aria-pressed="${s.id === pe.slotB}"><span class="time" style="font-size:20px;font-weight:800">${hhmm(s.time)}</span><span class="who"><strong>${s.players.length} players</strong><small>${names(s)}</small></span><span class="check">${s.id === pe.slotB ? '✓' : ''}</span></button>`).join('')}</div>`
      : '<div class="empty-state">No other groups with a member are booked that day yet.</div>'}
    ${b ? `
    <h3>Team style</h3>
    <div class="games" role="radiogroup">${Object.entries(EVENT_STYLES).map(([k, s]) => `<button class="gamecard" role="radio" aria-checked="${pe.style === k}" data-style="${k}" ${k === 'ryder' && !ryderOK ? 'disabled' : ''}><span class="radio"></span><span class="who"><strong>${s.name}</strong><small>${k === 'ryder' && !ryderOK ? 'Needs two full four-balls' : s.desc}</small></span></button>`).join('')}</div>
    <h3>Format</h3>
    <div class="games" role="radiogroup">${EVENT_FORMATS[pe.style].map(f => `<button class="gamecard" role="radio" aria-checked="${pe.format === f.k}" data-fmt="${f.k}"><span class="radio"></span><span class="who"><strong>${f.name}</strong><small>${f.desc}</small></span></button>`).join('')}</div>
    <div class="card evsec"><div class="tnames">
      <div><label for="pe-na">Team name</label><input id="pe-na" value="${esc(pe.names.A)}" maxlength="30"></div>
      <div><label for="pe-nb">Team name</label><input id="pe-nb" value="${esc(pe.names.B)}" maxlength="30"></div></div>
      ${pe.style === 'fourball' ? `<span class="hint">${esc(pe.names.A)} is your group (${hhmm(a.time)}); ${esc(pe.names.B)} is the ${hhmm(b.time)} group.</span>` : ''}
    </div>
    ${pe.style === 'ryder' ? `<h3>Teams</h3><div class="hint">Two from each four-ball on each team. Each four-ball plays a better-ball match.</div>
      ${[a, b].map(s => `<div class="card evsec"><div class="pinhead"><b>${hhmm(s.time)}</b><span class="hint">${countA(s)} v ${4 - countA(s)}</span></div><div class="tlist">${s.players.map(p => `<div class="trow"><span class="who"><strong>${esc(p.memberId === me.id ? 'You' : p.name)}</strong><small>${p.guest ? 'Guest' : 'Member'}</small></span><span class="tseg"><button data-tm="${p.id}" data-t="A" aria-pressed="${pe.teams[p.id] === 'A'}" style="--tc:var(--green)">${esc(pe.names.A)}</button><button data-tm="${p.id}" data-t="B" aria-pressed="${pe.teams[p.id] === 'B'}" style="--tc:var(--loss)">${esc(pe.names.B)}</button></span></div>`).join('')}</div></div>`).join('')}
      ${teamsOK ? '' : '<div class="gerr">Each four-ball needs two players on each team.</div>'}` : ''}
    <p class="gerr" id="pe-err" role="alert"></p>` : ''}
  </div>
  ${b ? `<div class="cta"><button class="primary" id="pe-send" ${teamsOK ? '' : 'disabled'}>Invite the ${hhmm(b.time)} group</button></div>` : ''}`

  const redraw = () => keepScroll(render)
  const readNames = () => {
    const na = $('pe-na'), nb = $('pe-nb')
    if (na && (na.value !== pe.names.A || nb.value !== pe.names.B)) { pe.names = { A: na.value, B: nb.value }; pe.namesEdited = true }
  }
  document.querySelectorAll('[data-day]').forEach(x => (x.onclick = () => { S.pe = freshDraft(x.dataset.day); redraw() }))
  document.querySelectorAll('[data-a]').forEach(x => (x.onclick = () => { pe.slotA = +x.dataset.a; pe.slotB = null; pe.teams = {}; redraw() }))
  document.querySelectorAll('[data-b]').forEach(x => (x.onclick = () => { readNames(); pe.slotB = +x.dataset.b; pe.teams = {}; redraw() }))
  document.querySelectorAll('[data-style]').forEach(x => (x.onclick = () => { readNames(); if (pe.style !== x.dataset.style) pe.namesEdited = false; pe.style = x.dataset.style; redraw() }))
  document.querySelectorAll('[data-fmt]').forEach(x => (x.onclick = () => { readNames(); pe.format = x.dataset.fmt; redraw() }))
  document.querySelectorAll('[data-tm]').forEach(x => (x.onclick = () => { readNames(); pe.teams[+x.dataset.tm] = x.dataset.t; redraw() }))
  ;['pe-na', 'pe-nb'].forEach(id => { const el = $(id); if (el) el.onchange = () => { readNames(); redraw() } })
  const send = $('pe-send')
  if (send) send.onclick = async () => {
    readNames()
    send.disabled = true
    const teams = pe.style === 'ryder' ? Object.fromEntries([...a.players, ...b.players].map(p => [p.id, pe.teams[p.id]])) : {}
    try {
      await api.proposePlayerEvent({ slotA: a.id, slotB: b.id, style: pe.style, format: pe.format, teamNames: pe.names, teams })
    } catch (err) {
      $('pe-err').textContent = err.message
      send.disabled = false
      return
    }
    const sent = `${hhmm(b.time)} group`
    S.pe = freshDraft()
    await back()
    toast(`Invitation sent to the ${sent}`)
  }
}

export const freshDraft = (date = null) => ({ date, slotA: null, slotB: null, style: 'fourball', format: 'best2', names: { A: '', B: '' }, namesEdited: false, teams: {} })
