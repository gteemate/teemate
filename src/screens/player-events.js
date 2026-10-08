// Player events on the Scores tab: status banners for my events and the invitation pop-up.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, keepScroll, render, toast, top0 } from '../ui.js'
import { EVENT_STYLES, eventFormatName } from '../games.js'
import { hhmm, fromIso, longDay, isoDate, today } from '../dates.js'

const first = n => n.split(' ')[0]
const dayText = e => (e.date === isoDate(today()) ? 'today' : longDay(fromIso(e.date)))
export const myGroup = (e, meId) => e.groups.find(g => g.slot === e.players.find(p => p.memberId === meId)?.slot)
const host = e => e.groups.find(g => g.host)
const invited = e => e.groups.filter(g => !g.host)

/** "Blues v Reds", or "08:10 v 08:20 v 08:30" for four-ball v four-ball. HTML-escaped unless plain. */
export function eventTitle(e, plain = false) {
  const x = plain ? s => s : esc
  return e.style === 'fourball' ? e.groups.map(g => x(e.teamNames[g.slot] ?? hhmm(g.time))).join(' v ') : `${x(e.teamNames.A)} v ${x(e.teamNames.B)}`
}
export const eventSubtitle = e => `${EVENT_STYLES[e.style].name} · ${esc(eventFormatName(e.format))} · ${dayText(e)}`

/** Teams as [{ name, players }] for the pop-up. */
export function teamLists(e) {
  const names = ps => ps.map(p => esc(p.name) + (p.guest ? ' (guest)' : '')).join(', ')
  if (e.style === 'fourball') return e.groups.map(g => ({ name: esc(e.teamNames[g.slot] ?? hhmm(g.time)), players: names(e.players.filter(p => p.slot === g.slot)) }))
  return ['A', 'B'].map(k => ({ name: esc(e.teamNames[k]), players: names(e.players.filter(p => p.team === k)) }))
}

function stateLine(e, me) {
  const mine = myGroup(e, me.id)
  const waiting = invited(e).filter(g => !g.answer).map(g => hhmm(g.time))
  const accepted = invited(e).filter(g => g.answer === 'accepted').map(g => hhmm(g.time))
  if (e.status === 'accepted') return 'On! Everyone has accepted'
  if (e.status === 'declined') { const d = invited(e).find(g => g.answer === 'declined'); return `Declined by ${d?.answeredBy ? esc(first(d.answeredBy.name)) : 'a group'} (${d ? hhmm(d.time) : ''})` }
  if (!mine.host && !mine.answer) return `Invitation from ${esc(first(e.createdBy.name))} (${hhmm(host(e).time)})`
  return (accepted.length ? `${accepted.join(', ')} accepted · ` : '') + `waiting for ${waiting.join(', ')}`
}

/** Banners for my events (anything not cancelled). */
export function banners(events, me) {
  return events.filter(e => e.status !== 'cancelled').map(e => {
    const mine = myGroup(e, me.id)
    const acts = []
    if (e.status === 'pending' && !mine.host && !mine.answer) acts.push(`<button class="linkbtn" data-pe-open="${e.id}">Answer</button>`)
    if (e.status === 'accepted') acts.push(`<button class="linkbtn" data-pe-board="${e.id}">Live board</button>`)
    if ((e.status === 'pending' || e.status === 'accepted') && e.createdBy.id === me.id) acts.push(`<button class="linkbtn" data-pe-cancel="${e.id}">Cancel</button>`)
    return `<div class="card pebanner pe-${e.status}"><div class="who"><strong>${eventTitle(e)}</strong><small>${eventSubtitle(e)}</small><small class="pestate">${stateLine(e, me)}</small></div><div class="peacts">${acts.join('')}</div></div>`
  }).join('')
}

export function bindBanners(events, me) {
  document.querySelectorAll('[data-pe-cancel]').forEach(b => (b.onclick = async () => {
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Sure?'; return }
    await api.cancelPlayerEvent(+b.dataset.peCancel)
    await keepScroll(render)
    toast('Event cancelled')
  }))
  document.querySelectorAll('[data-pe-open]').forEach(b => (b.onclick = () => { S.peDismissed.delete(+b.dataset.peOpen); invitePopup(events.find(e => e.id === +b.dataset.peOpen), me) }))
  document.querySelectorAll('[data-pe-board]').forEach(b => (b.onclick = async () => { S.peId = +b.dataset.peBoard; S.sview = 'pevent'; await render(); top0() }))
}

/** The first invitation waiting for my group's answer that I haven't put off this session. */
export function pendingInvite(events, me) {
  return events.find(e => { const g = myGroup(e, me.id); return e.status === 'pending' && g && !g.host && !g.answer && !S.peDismissed.has(e.id) })
}

export function invitePopup(e, me) {
  if (!e) return
  const h = host(e), others = invited(e), mine = me && myGroup(e, me.id)
  // "… with your group and 17:00" when other groups are invited too
  const rest = others.filter(g => g !== mine).map(g => hhmm(g.time))
  const withWho = rest.length ? ` with your group and ${rest.join(', ')}` : ''
  $('modal').innerHTML = `<div class="overlay" id="ovl"><div class="sheet" role="dialog" aria-labelledby="pet">
    <h4 id="pet">${esc(first(e.createdBy.name))} from ${hhmm(h.time)} would like to play an event${withWho}</h4>
    <p class="hint" style="margin:0 0 6px">${esc(first(e.createdBy.name))} has proposed these teams and this format for ${dayText(e)}. Do you agree?${others.length > 1 ? ' It starts once every group has accepted.' : ''}</p>
    <div class="card pecard">
      <div><span class="gm-lbl">Format</span><b>${EVENT_STYLES[e.style].name} · ${esc(eventFormatName(e.format))}</b></div>
      ${teamLists(e).map((t, i) => `<div><span class="gm-lbl" style="color:${['var(--green)', 'var(--loss)'][i % 2]}">${t.name}</span><span>${t.players}</span></div>`).join('')}
    </div>
    <p class="gerr" id="peerr" role="alert"></p>
    <div class="gm-btns"><button class="ghost" id="pe-no">Decline</button><button class="primary" id="pe-yes">Accept</button></div>
    <button class="linkbtn" id="pe-later" style="align-self:center">Decide later</button>
  </div></div>`
  const close = () => { $('modal').innerHTML = '' }
  $('pe-later').onclick = () => { S.peDismissed.add(e.id); close() }
  $('ovl').onclick = ev => { if (ev.target.id === 'ovl') { S.peDismissed.add(e.id); close() } }
  const answer = accept => async () => {
    $('pe-yes').disabled = $('pe-no').disabled = true
    try {
      await api.answerPlayerEvent(e.id, accept)
    } catch (err) {
      $('peerr').textContent = err.message
      $('pe-yes').disabled = $('pe-no').disabled = false
      return
    }
    close()
    await render()
    top0()
    toast(accept ? (others.length > 1 ? 'Accepted. It starts once every group has accepted' : `You’re on: ${eventTitle(e, true)}`) : `You declined ${first(e.createdBy.name)}’s invitation`)
  }
  $('pe-yes').onclick = answer(true)
  $('pe-no').onclick = answer(false)
}
