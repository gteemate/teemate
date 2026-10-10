// The alerts drop-down: things that need you (alerts.js picks them) slide down from the top of the screen, one at a
// time, on every screen. OK the club office moving or cancelling your tee time, Accept/Decline a match challenge,
// OK an answered tee time request, the halfway hut (order
// after hole 8; your order is ready), or Later (hides it until
// the app is next opened; a gold dot by the date, or at the top right, brings it back). Checked after every screen
// is drawn and when the app comes back to the front. No live pushes.
import * as api from './api.js'
import { S } from './state.js'
import { $, esc, render, toast } from './ui.js'
import { isoDate, today } from './dates.js'
import { pickAlerts, alertCheckDue } from './alerts.js'

const hidden = new Set() // Later, until the app is next opened
const done = new Set() // answered or OK'd this visit (the server catches up on the next check)
let shown = [], timer = null, busy = false

// The halfway hut: on? my card, my orders today, and (kept on this phone) which cards I've been asked about and
// which ready orders I've OK'd. Nothing is fetched beyond whether it's on while the hut is switched off.
const remembered = k => { try { return JSON.parse(localStorage.getItem(k)) ?? [] } catch { return [] } }
const remember = (k, id) => { try { localStorage.setItem(k, JSON.stringify([...remembered(k), id].slice(-50))) } catch { /* no storage */ } }
async function hutNow() {
  const { on } = await api.getHut()
  const [card, orders] = await Promise.all([on ? api.getCurrentRound() : null, api.myHutOrders()])
  return { on, card, orders, asked: remembered('teemate.hutAsked'), seen: remembered('teemate.hutSeen') }
}

let lastPlace = null, lastAt = 0
/**
 * Look for alerts and show the first one: on a new screen (`place`), or `force` (the app came back to the front);
 * a redraw of the same screen only looks once a minute. Debounced; a check already running is left to finish.
 */
/** Look now, on the same screen (e.g. hole 8 has just been saved). */
export const forceAlertCheck = () => checkAlerts(lastPlace, true)

export function checkAlerts(place, force = false) {
  const now = Date.now()
  if (!force && !alertCheckDue(lastPlace, place, lastAt, now)) return draw() // same screen redrawn: keep what's showing
  lastPlace = place; lastAt = now
  clearTimeout(timer)
  timer = setTimeout(run, 300)
}

async function run() {
  if (busy || !$('alerts')) return
  busy = true
  try {
    const [me, playerEvents, requests, hutState, notices] = await Promise.all([api.getMe(), api.getMyPlayerEvents(), api.getMyTeeTimeRequests(), hutNow(), api.getBookingNotices()])
    if (!me) return clear()
    const all = pickAlerts({ me, playerEvents, requests, date: isoDate(today()), hut: hutState, notices }).filter(a => !done.has(a.key))
    // The Scores tab asks about a challenge itself, so it doesn't drop down there too.
    showAlerts(all.filter(a => !(a.kind === 'challenge' && S.tab === 'scores')))
  } catch (err) {
    console.warn('Alerts not checked', err)
  } finally {
    busy = false
  }
}

function clear() { showAlerts([]) }

/** Show these alerts (from pickAlerts), first one dropped down. */
export function showAlerts(list) { shown = list; draw() }

function draw() {
  const box = $('alerts')
  const visible = shown.filter(a => !hidden.has(a.key))
  const a = visible[0]
  box.innerHTML = a ? `<div class="alertcard ${a.kind}" role="alertdialog" aria-labelledby="al-t" aria-describedby="al-d">
      <b id="al-t">${esc(a.title)}</b><span id="al-d">${esc(a.detail)}</span>
      <div class="al-btns">${a.actions.map(x => `<button class="${x.primary ? 'primary' : x.id === 'later' ? 'linkbtn' : 'ghost'}" data-al="${x.id}">${esc(x.label)}</button>`).join('')}</div>
    </div>` : ''
  // Slide in only when a new alert arrives (not when the same one is redrawn).
  if (!a) box.classList.remove('open')
  else if (box.dataset.key !== a.key) { box.classList.remove('open'); requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add('open'))) }
  else box.classList.add('open')
  box.dataset.key = a?.key ?? ''
  if (a) box.querySelectorAll('[data-al]').forEach(b => (b.onclick = () => act(a, b.dataset.al, b)))
  drawDot(!a && shown.some(x => hidden.has(x.key)))
}

// A gold dot when something is waiting but hidden: next to the date on Home, at the top right elsewhere.
function drawDot(on) {
  $('alertdot')?.remove()
  if (!on) return
  const at = document.querySelector('#hdr .homedate') ?? $('hdr')
  at.insertAdjacentHTML('beforeend', '<button class="alertdot" id="alertdot" aria-label="Show alerts"></button>')
  $('alertdot').onclick = e => { e.stopPropagation(); hidden.clear(); draw() }
}

async function act(a, id, btn) {
  if (id === 'later') { hidden.add(a.key); return draw() }
  if (id === 'details') {
    hidden.add(a.key)
    S.tab = 'scores'; S.sview = 'pevent'; S.peId = a.ref.peId
    return render()
  }
  if (id === 'order' || id === 'nothanks') { // the hut's question: asked either way
    remember('teemate.hutAsked', a.ref.cardId)
    done.add(a.key)
    shown = shown.filter(x => x.key !== a.key)
    if (id === 'nothanks') return draw()
    S.tab = 'home'; S.aview = 'hutorder'
    return render()
  }
  if (id === 'ok' && a.kind === 'notice') {
    done.add(a.key)
    shown = shown.filter(x => x.key !== a.key)
    api.seenBookingNotice(a.ref.noticeId).catch(() => {})
    if (S.tab === 'home' && ['home', 'mine'].includes(S.aview)) await render() // the booking has changed: show it as it is now
    return draw()
  }
  if (id === 'ok' && a.kind === 'hutready') {
    remember('teemate.hutSeen', a.ref.orderId)
    done.add(a.key)
    shown = shown.filter(x => x.key !== a.key)
    return draw()
  }
  if (id === 'ok') {
    done.add(a.key)
    shown = shown.filter(x => x.key !== a.key)
    if (!shown.some(x => x.kind === 'request')) api.markTeeTimeRequestsSeen().catch(() => {}) // the last one read
    return draw()
  }
  // Accept / Decline: answers for my group, as on the Scores tab.
  btn.disabled = true
  done.add(a.key)
  shown = shown.filter(x => x.key !== a.key)
  try {
    await api.answerPlayerEvent(a.ref.peId, id === 'accept')
    toast(id === 'accept' ? 'Accepted. The match is on.' : 'Declined')
  } catch (err) {
    toast(err.message) // e.g. the other group called it off; the alert goes either way
  }
  await render()
}
