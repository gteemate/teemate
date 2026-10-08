// Player events on the Scores tab: status banners for my events and the invitation pop-up.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, keepScroll, render, toast, top0 } from '../ui.js'
import { EVENT_STYLES, eventFormatName } from '../games.js'
import { hhmm, fromIso, longDay, isoDate, today } from '../dates.js'

const first = n => n.split(' ')[0]
const mineIn = (e, meId) => e.players.find(p => p.memberId === meId)?.group // 'A' (inviting) or 'B' (invited)
const dayText = e => (e.date === isoDate(today()) ? 'today' : longDay(fromIso(e.date)))

/** Teams as text: { A: 'Gary, Declan, …', B: … } */
export function teamLists(e) {
  const t = k => e.players.filter(p => p.team === k).map(p => esc(p.name) + (p.guest ? ' (guest)' : '')).join(', ')
  return { A: t('A'), B: t('B') }
}

/** Banners for my events that need showing (anything not cancelled). */
export function banners(events, me) {
  const live = events.filter(e => e.status !== 'cancelled')
  return live.map(e => {
    const side = mineIn(e, me.id), other = side === 'A' ? hhmm(e.timeB) : hhmm(e.timeA)
    const title = `${esc(e.teamNames.A)} v ${esc(e.teamNames.B)}`
    const sub = `${EVENT_STYLES[e.style].name} · ${esc(eventFormatName(e.format))} · ${dayText(e)}`
    let state, act = ''
    if (e.status === 'pending' && side === 'A') { state = `Waiting for the ${other} group to answer`; act = `<button class="linkbtn" data-pe-cancel="${e.id}">Cancel</button>` }
    else if (e.status === 'pending') { state = `Invitation from ${esc(first(e.createdBy.name))} (${hhmm(e.timeA)})`; act = `<button class="linkbtn" data-pe-open="${e.id}">Answer</button>` }
    else if (e.status === 'accepted') { state = `On! ${e.respondedBy ? esc(first(e.respondedBy.name)) + ' accepted' : 'Accepted'}`; act = e.createdBy.id === me.id ? `<button class="linkbtn" data-pe-cancel="${e.id}">Cancel</button>` : '' }
    else { state = `Declined by ${e.respondedBy ? esc(first(e.respondedBy.name)) : 'the other group'}` }
    return `<div class="card pebanner pe-${e.status}"><div class="who"><strong>${title}</strong><small>${sub}</small><small class="pestate">${state}</small></div>${act}</div>`
  }).join('')
}

export function bindBanners(events) {
  document.querySelectorAll('[data-pe-cancel]').forEach(b => (b.onclick = async () => {
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Sure?'; return }
    await api.cancelPlayerEvent(+b.dataset.peCancel)
    await keepScroll(render)
    toast('Event cancelled')
  }))
  document.querySelectorAll('[data-pe-open]').forEach(b => (b.onclick = () => { S.peDismissed.delete(+b.dataset.peOpen); invitePopup(events.find(e => e.id === +b.dataset.peOpen)) }))
}

/** The first invitation waiting for my answer that I haven't put off this session. */
export const pendingInvite = (events, me) => events.find(e => e.status === 'pending' && mineIn(e, me.id) === 'B' && !S.peDismissed.has(e.id))

export function invitePopup(e) {
  if (!e) return
  const teams = teamLists(e)
  $('modal').innerHTML = `<div class="overlay" id="ovl"><div class="sheet" role="dialog" aria-labelledby="pet">
    <h4 id="pet">${esc(first(e.createdBy.name))} from ${hhmm(e.timeA)} would like to play an event</h4>
    <p class="hint" style="margin:0 0 6px">${esc(first(e.createdBy.name))} has proposed these teams and this format for ${dayText(e)}. Do you agree?</p>
    <div class="card pecard">
      <div><span class="gm-lbl">Format</span><b>${EVENT_STYLES[e.style].name} · ${esc(eventFormatName(e.format))}</b></div>
      <div><span class="gm-lbl" style="color:var(--green)">${esc(e.teamNames.A)}</span><span>${teams.A}</span></div>
      <div><span class="gm-lbl" style="color:var(--loss)">${esc(e.teamNames.B)}</span><span>${teams.B}</span></div>
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
    toast(accept ? `You’re on: ${e.teamNames.A} v ${e.teamNames.B}` : `You declined ${first(e.createdBy.name)}’s invitation`)
  }
  $('pe-yes').onclick = answer(true)
  $('pe-no').onclick = answer(false)
}
