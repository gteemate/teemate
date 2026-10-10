// A match in an event (Match N on a day): both pairs, the status, the match state after each hole, and the full
// scorecard (par, SI, each player's playing handicap, shots as dots, scores). Read-only unless it's your match,
// which also gets its one action: Book this match / Add the rest / Start scoring (matchActionHtml, also on the board).
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, sur, header, render, toast, top0 } from '../ui.js'
import { hhmm, longDay, fromIso, isoDate, today, nextDays } from '../dates.js'
import { shotsOnHole } from '../scoring.js'
import { buildLibrary, preferredGame } from '../games.js'
import { loadBoard, boardResult } from './event-board.js'
import { newRound, setRound, lineupFromTeeTime } from './scores.js'

export async function load() {
  return loadBoard(S.evId, S.matchDay)
}

/**
 * Your match's action from where its players are booked that day (match.js matchBooking):
 * { kind, slot?, missing?, clash? } plus date, ids (the four), meId, names (id → name), eventName and started (a card
 * for that tee time already).
 */
export function matchActionHtml(st) {
  if (!st) return ''
  const name = id => esc(st.names(id))
  if (st.kind === 'none') return '<button class="primary sm" data-mact="book">Book this match</button>'
  if (st.kind === 'partial') return `<button class="primary sm" data-mact="add">Add the rest to your ${hhmm(st.slot.time)}</button>`
  const move = st.moveBooking ? '<button class="ghost sm" data-mact="move">Rearrange</button>' : ''
  if (st.kind === 'together') return st.date === isoDate(today()) ? `<button class="primary sm" data-mact="score">${st.started ? 'Enter scores' : 'Start scoring'}</button>${move}`
    : `<span class="mbooked">Booked: ${longDay(fromIso(st.date)).split(' ')[0]} ${hhmm(st.slot.time)}</span>${move}`
  return `<span class="mwarn">Your match needs all four in one tee time.${st.clash ? ` ${name(st.clash.id)} is booked at ${hhmm(st.clash.time)}.` : ' There isn’t room for everyone on yours.'}</span>`
}

export function bindMatchAction(st) {
  document.querySelectorAll('[data-mact]').forEach(b => (b.onclick = async e => {
    e.stopPropagation() // not the match card's own tap
    const others = st.ids.filter(id => id !== st.meId)
    if (b.dataset.mact === 'move') {
      // Rearrange: the day's tee sheet with room for all four; picking a time moves the booking (tee-times.js).
      const days = nextDays(((await api.getBookingRules()).days) + 1).map(isoDate), i = days.indexOf(st.date)
      if (i < 0) { toast('Tee times for that day aren’t open yet.'); return }
      Object.assign(S, { tab: 'home', aview: 'tee', day: i, reqMode: false, matchMove: { bookingId: st.moveBooking, from: st.slot.time, size: st.ids.length } })
    } else if (b.dataset.mact === 'book') {
      // The tee sheet on the match day with the other three ready to add; beyond the booking window, a request.
      const rules = await api.getBookingRules(), days = nextDays(rules.days + 1).map(isoDate), i = days.indexOf(st.date)
      Object.assign(S, { tab: 'home', aview: 'tee', matchPick: others, reqMode: i < 0, ...(i < 0 ? { reqDate: st.date, reqReason: `Match in ${st.eventName}` } : { day: i }) })
    } else if (b.dataset.mact === 'add') {
      Object.assign(S, { tab: 'home', aview: 'book', slotId: st.slot.id, picked: st.missing, guests: [], reqMode: false })
      const days = nextDays(((await api.getBookingRules()).days) + 1).map(isoDate)
      S.day = Math.max(0, days.indexOf(st.date))
    } else {
      const [mine, course, games, cur] = await Promise.all([api.getMyTeeTimes(today()), api.getCourse(), api.getGameSettings(), api.getCurrentRound()])
      if (cur?.slotId === st.slot.id) { Object.assign(S, { tab: 'scores', sview: 'card' }); await render(); top0(); return } // already scoring it
      const slot = mine.find(s => s.id === st.slot.id)
      if (!slot) { toast('That tee time has changed. Have another look.'); return render() }
      const lineup = lineupFromTeeTime(slot, st.meId)
      setRound(newRound(course, lineup, preferredGame(buildLibrary(games), lineup.length), slot.id))
      Object.assign(S, { tab: 'scores', sview: 'counts' }) // counts for this match already ticked
    }
    await render(); top0()
  }))
}

const stateText = d => (d === 0 ? 'AS' : `${Math.abs(d)}`)

export function draw(data) {
  const back = async () => { S.aview = S.matchFrom ?? 'evboard'; await render(); top0() }
  const { e } = data
  const day = S.matchDay, no = S.matchNo
  const r = e && boardResult(data)
  const mt = r?.byDay?.[day]?.[no - 1]
  if (!mt) { header('Match', '', back); $('main').innerHTML = '<div class="screen"><div class="empty-state">This match is no longer in the draw.</div></div>'; return }
  header(`Match ${no}`, `${esc(e.name)}${e.days > 1 ? ` · day ${day}` : ''}`, back)
  const A = e.A, B = e.B, holes = data.course.holes, res = mt.res, run = mt.match.running
  const side = d => (d > 0 ? A : d < 0 ? B : null)
  const lead = side(res.d)
  const tee = data.mine?.no === no && data.action?.slot ? ` · Tee ${hhmm(data.action.slot.time)}` : ''
  const status = res.st === 'ns' ? `<b class="ms-big">Not started</b><small>${tee.replace(' · ', '')}</small>`
    : res.st === 'done' ? `<b class="ms-big" style="color:${lead ? lead.col : 'var(--muted)'}">${lead ? `${esc(lead.name)} won ${esc(res.txt)}` : 'Halved'}</b><small>Final</small>`
    : `<b class="ms-big" style="color:${lead ? lead.col : 'var(--muted)'}">${res.d ? `${Math.abs(res.d)} up` : 'AS'}</b><small>thru ${res.thru} <span class="livedot">● live</span></small>`
  const ps = mt.players, pa = ps.filter(p => p.team === 'A'), pb = ps.filter(p => p.team === 'B')
  const pair = (list, c, right) => `<div class="mside${right ? ' r' : ''}"><span class="pairav">${list.map(p => `<span class="av" style="border-color:${c}">${ini(p.name)}</span>`).join('')}</span><span>${list.map(p => esc(sur(p.name))).join('<br>')}</span></div>`
  // Match summary: the state after each hole, in the colour of the side that's up.
  const cur = res.st === 'live' ? run.length : -1
  const holeDot = i => { const d = run[i]; const s = d == null ? '–' : stateText(d), c = d ? side(d).col : 'var(--muted)'
    return `<div class="msh${i === cur ? ' cur' : ''}"><span class="mshn">${i + 1}</span><b style="color:${c}">${s}${d ? '<small>▲</small>' : ''}</b></div>` }
  // Scorecard: Out and In, with shots as dots and the winning side's scores tinted.
  const won = i => (run[i] == null ? 0 : run[i] - (i ? run[i - 1] : 0))
  const table = (from, label) => {
    const idx = Array.from({ length: 9 }, (_, k) => from + k)
    const tot = (f) => idx.reduce((t, i) => t + (f(i) ?? 0), 0)
    const row = p => { const col = p.team === 'A' ? A.col : B.col, mine = p.team === 'A' ? 1 : -1
      const cells = idx.map(i => { const g = p.gross[i], sh = shotsOnHole(p.ph, holes[i].si)
        return `<td class="${won(i) === mine ? 'mwon' : ''}" style="${won(i) === mine ? `background:${col}38` : ''}">${g ?? ''}<i>${'•'.repeat(sh)}</i></td>` }).join('')
      const done = idx.filter(i => p.gross[i] != null)
      return `<tr><th style="color:${col}">${esc(sur(p.name))}<small>(${p.ph})</small></th>${cells}<td class="mtot">${done.length ? tot(i => p.gross[i]) : ''}</td></tr>` }
    return `<div class="card mcardtbl"><table class="msc"><thead><tr><th>${label}</th>${idx.map(i => `<th>${i + 1}</th>`).join('')}<th>Tot</th></tr></thead><tbody>
      <tr class="mpar"><th>Par</th>${idx.map(i => `<td>${holes[i].par}</td>`).join('')}<td class="mtot">${tot(i => holes[i].par)}</td></tr>
      <tr class="mpar"><th>SI</th>${idx.map(i => `<td>${holes[i].si}</td>`).join('')}<td></td></tr>
      ${ps.map(row).join('')}</tbody></table></div>`
  }
  const mineAction = data.mine?.no === no ? matchActionHtml(data.action) : ''
  $('main').innerHTML = `<div class="screen">
    <div class="card mcard"><div class="mgrid">${pair(pa, A.col)}<div class="mstat">${status}</div>${pair(pb, B.col, true)}</div>
      ${mineAction ? `<div class="mact">${mineAction}</div>` : ''}</div>
    <h3>Match summary</h3>
    <div class="card msum"><div class="msrow">${holes.slice(0, 9).map((_, i) => holeDot(i)).join('')}</div><div class="msrow">${holes.slice(9).map((_, i) => holeDot(i + 9)).join('')}</div></div>
    <h3>Scorecard</h3>
    ${table(0, 'Out')}${table(9, 'In')}
    <span class="hint">${data.mine?.no === no ? 'Enter scores on your scorecard: this page fills in as holes are saved.' : 'Scores come from the players’ own scorecard and update as holes are saved.'} Dots are shots received.</span>
  </div>`
  if (mineAction) bindMatchAction(data.action)
}
