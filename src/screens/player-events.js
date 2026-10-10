// Player events on the Scores tab: status banners for my events and the invitation pop-up.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, keepScroll, render, toast, top0 } from '../ui.js'
import { eventStyleName, eventFormatName } from '../games.js'
import { needsMyAnswer } from '../home-today.js'
import { counterDraft } from './challenge.js'
import { hhmm, fromIso, longDay, isoDate, today } from '../dates.js'

const first = n => n.split(' ')[0]
const dayText = e => (e.date === isoDate(today()) ? 'today' : longDay(fromIso(e.date)))
export const myGroup = (e, meId) => e.groups.find(g => g.slot === e.players.find(p => p.memberId === meId)?.slot)
const host = e => e.groups.find(g => g.host)
// The version on the table was put there by one group (the host, or whoever last suggested changes);
// every other group has to accept it.
const proposer = e => e.groups.find(g => g.slot === e.proposerSlot) ?? host(e)
const asked = e => e.groups.filter(g => g !== proposer(e))
const countered = e => proposer(e) !== host(e) || e.proposedBy?.id !== e.createdBy.id
/** My group (or, for a one-on-one, I) still has to answer the version on the table. */
const toAnswer = (e, me) => needsMyAnswer(e, me)

/** "Blues v Reds", or "08:10 v 08:20 v 08:30" for four-ball v four-ball. HTML-escaped unless plain. */
export function eventTitle(e, plain = false) {
  const x = plain ? s => s : esc
  return e.style === 'fourball' ? e.groups.map(g => x(e.teamNames[g.slot] ?? hhmm(g.time))).join(' v ') : `${x(e.teamNames.A)} v ${x(e.teamNames.B)}`
}
export const eventSubtitle = e => `${eventStyleName(e.style)} · ${esc(eventFormatName(e.format))} · ${dayText(e)}`

/** Teams as [{ name, players }] for the pop-up. */
export function teamLists(e) {
  const names = ps => ps.map(p => esc(p.name) + (p.guest ? ' (guest)' : '')).join(', ')
  if (e.style === 'fourball') return e.groups.map(g => ({ name: esc(e.teamNames[g.slot] ?? hhmm(g.time)), players: names(e.players.filter(p => p.slot === g.slot)) }))
  return ['A', 'B'].map(k => ({ name: esc(e.teamNames[k]), players: names(e.players.filter(p => p.team === k)) }))
}

export function stateLine(e, me) {
  const mine = myGroup(e, me.id)
  const waiting = asked(e).filter(g => !g.answer).map(g => hhmm(g.time))
  const accepted = asked(e).filter(g => g.answer === 'accepted').map(g => hhmm(g.time))
  if (e.status === 'accepted') return e.style === 'singles' ? 'On! They’ve accepted' : 'On! Everyone has accepted'
  if (e.status === 'declined') { const d = asked(e).find(g => g.answer === 'declined'); return `Declined by ${d?.answeredBy ? esc(first(d.answeredBy.name)) : 'a group'} (${d ? hhmm(d.time) : ''})` }
  const by = `${esc(first(e.proposedBy.name))} (${hhmm(proposer(e).time)})`
  if (e.style === 'singles' && e.status === 'pending') return toAnswer(e, me) ? `Challenge from ${by}` : `waiting for ${esc(first(e.players.find(p => p.team === 'B').name))}`
  if (toAnswer(e, me)) return countered(e) ? `Changes suggested by ${by}` : `Invitation from ${by}`
  return (countered(e) ? `${mine === proposer(e) ? 'Your' : `${by}’s`} changes · ` : '') + (accepted.length ? `${accepted.join(', ')} accepted · ` : '') + `waiting for ${waiting.join(', ')}`
}

// A called-off event stays on the Scores tab, saying why, until it's dismissed on this phone.
const seenKey = id => `teemate.peOffSeen.${id}`
const offSeen = id => { try { return localStorage.getItem(seenKey(id)) === '1' } catch { return false } }

/** Banners for my events: live and pending ones, and called-off ones not yet dismissed. */
export function banners(events, me) {
  return events.filter(e => e.status !== 'cancelled' || (e.cancelNote && e.cancelledBy !== me.id && !offSeen(e.id))).map(e => {
    if (e.status === 'cancelled') return `<div class="card pebanner pe-cancelled"><div class="who"><strong>${eventTitle(e)}</strong><small>${eventSubtitle(e)}</small><small class="pestate">Off: ${esc(e.cancelNote)}</small></div><div class="peacts"><button class="linkbtn" data-pe-seen="${e.id}">OK</button></div></div>`
    const acts = []
    if (toAnswer(e, me)) acts.push(`<button class="linkbtn" data-pe-open="${e.id}">Answer</button>`)
    if (e.status === 'accepted') acts.push(`<button class="linkbtn" data-pe-board="${e.id}">Live board</button>`)
    if (e.status === 'pending' || e.status === 'accepted') acts.push(`<button class="linkbtn" data-pe-cancel="${e.id}">${e.createdBy.id === me.id ? 'Cancel' : 'Call off'}</button>`)
    return `<div class="card pebanner pe-${e.status}"><div class="who"><strong>${eventTitle(e)}</strong><small>${eventSubtitle(e)}</small><small class="pestate">${stateLine(e, me)}</small></div><div class="peacts">${acts.join('')}</div></div>`
  }).join('')
}

/** Cancel / Call off buttons (data-pe-cancel): two taps, then everyone else in it is told. */
export function bindCancel() {
  document.querySelectorAll('[data-pe-cancel]').forEach(b => (b.onclick = async () => {
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Sure?'; return }
    await api.cancelPlayerEvent(+b.dataset.peCancel)
    await keepScroll(render)
    toast('Called off. Everyone in it will see it’s off')
  }))
}

export function bindBanners(events, me) {
  document.querySelectorAll('[data-pe-seen]').forEach(b => (b.onclick = () => { try { localStorage.setItem(seenKey(b.dataset.peSeen), '1') } catch { /* shows again next time */ } keepScroll(render) }))
  bindCancel()
  document.querySelectorAll('[data-pe-open]').forEach(b => (b.onclick = () => { S.peDismissed.delete(+b.dataset.peOpen); invitePopup(events.find(e => e.id === +b.dataset.peOpen), me) }))
  document.querySelectorAll('[data-pe-board]').forEach(b => (b.onclick = async () => { S.peId = +b.dataset.peBoard; S.sview = 'pevent'; await render(); top0() }))
}

/** The first invitation waiting for my group's answer that I haven't put off this session. */
export function pendingInvite(events, me) {
  return events.find(e => toAnswer(e, me) && !S.peDismissed.has(e.id))
}

export function invitePopup(e, me) {
  if (!e) return
  const h = proposer(e), others = asked(e), mine = me && myGroup(e, me.id)
  // "… with your group and 17:00" when other groups are asked too
  const rest = e.groups.filter(g => g !== mine && g !== h).map(g => hhmm(g.time))
  const withWho = rest.length ? ` with your group and ${rest.join(', ')}` : ''
  const who = esc(first(e.proposedBy.name))
  $('modal').innerHTML = `<div class="overlay" id="ovl"><div class="sheet" role="dialog" aria-labelledby="pet">
    <h4 id="pet">${e.style === 'singles' ? `${who} from ${hhmm(h.time)} has challenged you to a one-on-one` : countered(e) ? `${who} from ${hhmm(h.time)} has suggested changes` : `${who} from ${hhmm(h.time)} would like to play an event${withWho}`}</h4>
    <p class="hint" style="margin:0 0 6px">${e.style === 'singles' ? `You each score on your own group’s card and the match is worked out from both, live for ${dayText(e)}. Do you accept?` : `${who} has proposed these teams and this format for ${dayText(e)}. Do you agree?${others.length > 1 ? ' It starts once every group has accepted.' : ''}`}</p>
    <div class="card pecard">
      <div><span class="gm-lbl">Format</span><b>${eventStyleName(e.style)} · ${esc(eventFormatName(e.format))}</b></div>
      ${teamLists(e).map((t, i) => `<div><span class="gm-lbl" style="color:${['var(--green)', 'var(--loss)'][i % 2]}">${t.name}</span><span>${t.players}</span></div>`).join('')}
    </div>
    <p class="gerr" id="peerr" role="alert"></p>
    <div class="gm-btns"><button class="ghost" id="pe-no">Decline</button><button class="primary" id="pe-yes">Accept</button></div>
    <div class="gm-btns">${e.style === 'singles' ? '' : '<button class="ghost" id="pe-counter">Suggest changes</button>'}<button class="ghost" id="pe-later">Decide later</button></div>
  </div></div>`
  const close = () => { $('modal').innerHTML = '' }
  $('pe-later').onclick = () => { S.peDismissed.add(e.id); close() }
  if ($('pe-counter')) $('pe-counter').onclick = async () => { close(); S.pe = counterDraft(e); S.sview = 'challenge'; await render(); top0() }
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
    toast(accept ? (others.length > 1 ? 'Accepted. It starts once every group has accepted' : `You’re on: ${eventTitle(e, true)}`) : `You declined ${first(e.proposedBy.name)}’s invitation`)
  }
  $('pe-yes').onclick = answer(true)
  $('pe-no').onclick = answer(false)
}
