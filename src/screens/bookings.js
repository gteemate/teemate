// Booking (the Booking tile on Home): my upcoming rounds, then + Add a booking (the tee sheet). Tap one for who's playing; delete it (if I made it; guest
// points come back) or withdraw (if someone else booked me in) from there, or by swiping it left.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, header, keepScroll, render, toast, fmtHcp, top0 } from '../ui.js'
import { DN, MN, fromIso, longDay, hhmm, isoDate, today } from '../dates.js'
import { requestStatus } from '../requests.js'
import { bindSwipes, swipeSwallowsClick } from '../swipe.js'
import { resetRound } from './scores.js'

export async function load() {
  const [bookings, me, requests] = await Promise.all([api.getMyBookings(), api.getMe(), api.getMyTeeTimeRequests()])
  if (requests.some(r => (r.status === 'approved' || r.status === 'declined') && !r.seen)) api.markTeeTimeRequestsSeen().catch(() => {}) // seen now: Home stops showing them
  const recent = r => r.status === 'pending' || (r.decidedAt && Date.now() - Date.parse(r.decidedAt) < 30 * 864e5)
  return { bookings, me, requests: requests.filter(recent) }
}

// Holes saved on this tee time's scorecard: deleting the booking then asks first, and deletes the card too.
const scored = b => b.mine && b.scoredHoles > 0

async function cancel(b) {
  let r
  try {
    r = await api.cancelBooking(b.id, scored(b))
  } catch (err) {
    toast(err.message)
    return false
  }
  resetRound() // Scores reloads, in case the card for that tee time went too
  await keepScroll(render)
  toast(r.result === 'deleted'
    ? `${hhmm(b.time)} booking deleted${r.cardsRemoved && scored(b) ? ' with its scorecard' : ''}${r.pointsBack ? ` · ${r.pointsBack} guest points back` : ''}`
    : `You’ve withdrawn from the ${hhmm(b.time)} booking`)
  return true
}

// Booking details: everyone on the tee time, and delete / withdraw.
function details(b, me) {
  const person = p => `<div class="lrow"><span class="av${p.guest ? ' gst' : ''}">${ini(p.name)}</span><span class="who"><strong>${esc(p.name)}${p.memberId === me.id ? ' (you)' : ''}</strong><small>${p.guest ? `Guest${p.club ? ' · ' + esc(p.club) : ''}` : 'Member'}</small></span><span class="hcp">${fmtHcp(p.hcp == null ? null : Number(p.hcp))}<small>HI</small></span></div>`
  const ours = b.people.filter(p => p.inBooking), others = b.people.filter(p => !p.inBooking)
  const act = scored(b) ? 'Delete booking and scores' : b.mine ? 'Delete booking' : 'Withdraw from this booking'
  const holes = n => `${n} hole${n === 1 ? '' : 's'}`
  $('modal').innerHTML = `<div class="overlay" id="ovl"><div class="sheet" role="dialog" aria-labelledby="bkt">
    <span class="kicker">${longDay(fromIso(b.date))}</span>
    <h4 id="bkt">${hhmm(b.time)} · 1st tee</h4>
    <span class="hint">${b.mine ? 'You booked this' : `Booked by ${esc(b.bookedBy ?? 'another member')}`}</span>
    <div class="card list">${ours.map(person).join('')}</div>
    ${others.length ? `<span class="hint">Also on this tee time</span><div class="card list">${others.map(person).join('')}</div>` : ''}
    ${scored(b) ? `<div class="card warn-box"><strong>Scores entered for ${holes(b.scoredHoles)}</strong><span>Deleting this booking also deletes the scorecard for this round.${b.guests ? ' Your guest points come back.' : ''}</span></div>`
      : `<span class="hint">${b.mine ? `Deleting takes everyone in your booking off this time${b.guests ? ' and gives your guest points back' : ''}.` : 'Withdrawing takes just you off. The rest of the booking stays.'} ${!b.mine && b.scoredHoles > 0 ? 'The group’s scorecard stays.' : 'A scorecard for it goes too, unless holes have been saved.'}</span>`}
    <div class="gm-btns"><button type="button" class="ghost" id="bk-close">${scored(b) ? 'Keep it' : 'Close'}</button><button class="primary" id="bk-act">${act}</button></div>
  </div></div>`
  const close = () => { $('modal').innerHTML = '' }
  $('bk-close').onclick = close
  $('ovl').onclick = e => { if (e.target.id === 'ovl') close() }
  $('bk-act').onclick = async () => {
    const btn = $('bk-act')
    if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.textContent = b.mine ? 'Tap again to delete' : 'Tap again to withdraw'; return }
    btn.disabled = true
    if (!(await cancel(b))) btn.disabled = false
  }
}

export function draw({ bookings, me, requests }) {
  S.reqMode = false // back at your bookings: Add a booking books; Request asks
  header('Booking', bookings.length ? `<b>${bookings.length}</b> coming up` : 'Nothing booked yet')
  const who = b => b.people.filter(p => p.inBooking).map(p => (p.memberId === me.id ? 'You' : p.name) + (p.guest ? ' (guest)' : '')).join(', ')
  const day = b => { const d = fromIso(b.date); return `<span class="bk-d"><b class="num">${d.getDate()}</b><small>${b.date === isoDate(today()) ? 'Today' : DN[d.getDay()]}</small></span>` }
  $('main').innerHTML = `<div class="screen">${bookings.length
    ? `<span class="kicker">Coming up</span>
      <div class="bklist">${bookings.map(b => `<div class="swipe"><button class="swdel" data-cancel="${b.id}">${b.mine ? 'Delete' : 'Withdraw'}</button>
        <div class="card bk swrow" data-swipe data-bk="${b.id}" role="button" tabindex="0" aria-label="${hhmm(b.time)} on ${esc(longDay(fromIso(b.date)))}: who’s playing">${day(b)}<span class="bk-m"><span class="bk-t num">${hhmm(b.time)}</span><span class="sub">${esc(who(b))}</span></span>${b.mine ? '' : `<span class="pill">Booked by ${esc((b.bookedBy ?? 'a member').split(' ')[0])}</span>`}</div></div>`).join('')}</div>
      <div class="hint">Tap a booking to see who’s playing. Swipe it left to delete it${bookings.some(b => !b.mine) ? ', or to withdraw from one someone else made for you' : ''}. Guest points come back when you delete.</div>`
    : '<div class="empty-state">No upcoming rounds.<br>Add a booking and it will show here.</div>'}
    ${requests.length ? `<span class="kicker">Requests</span><div class="bklist">${requests.map(r => {
      const st = requestStatus(r), d = fromIso(r.date)
      const row = `<div class="card bk req ${st.tone} swrow" data-swipe="1"><span class="bk-d"><b class="num">${d.getDate()}</b><small>${MN[d.getMonth()]}</small></span>
        <span class="bk-m"><span class="bk-t num">${hhmm(r.time)}</span><span class="sub">${esc(r.reason)}</span><span class="rqst">${esc(st.text)}</span></span>
        ${r.status === 'pending' ? `<button class="linkbtn" data-rqc="${r.id}">Cancel</button>` : '<span></span>'}</div>`
      // Swipe left: a waiting request is cancelled; an answered one is removed from this list.
      return `<div class="swipe">${r.status === 'pending' ? `<button class="swdel" data-rqc="${r.id}">Cancel</button>` : `<button class="swdel" data-rqx="${r.id}">Remove</button>`}${row}</div>`
    }).join('')}</div>` : ''}
    <button class="primary" id="bt">+ Add a booking</button>
    <button class="ghost dashed" id="rq">Request a tee time further ahead</button></div>`
  const bt = $('bt')
  document.querySelectorAll('[data-rqc]').forEach(b => (b.onclick = async () => {
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = b.classList.contains('swdel') ? 'Sure?' : 'Tap again to cancel'; return }
    b.disabled = true
    try { await api.cancelTeeTimeRequest(+b.dataset.rqc) } catch (err) { toast(err.message); b.disabled = false; return }
    await keepScroll(render); toast('Request cancelled')
  }))
  document.querySelectorAll('[data-rqx]').forEach(b => (b.onclick = async () => {
    b.disabled = true
    try { await api.dismissTeeTimeRequest(+b.dataset.rqx) } catch (err) { toast(err.message); b.disabled = false; return }
    await keepScroll(render); toast('Removed from your list')
  }))
  if (bt) bt.onclick = async () => { S.reqMode = false; S.aview = 'tee'; await render(); top0() }
  $('rq').onclick = async () => { S.reqMode = true; S.reqDate = null; S.reqReason = ''; S.aview = 'tee'; await render(); top0() }
  bindSwipes()
  document.querySelectorAll('[data-bk]').forEach(r => (r.onclick = () => { if (!swipeSwallowsClick(r)) details(bookings.find(b => b.id === +r.dataset.bk), me) }))
  document.querySelectorAll('[data-bk]').forEach(r => (r.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === r) { e.preventDefault(); r.click() } }))
  document.querySelectorAll('[data-cancel]').forEach(btn => (btn.onclick = async () => {
    const b = bookings.find(x => x.id === +btn.dataset.cancel)
    if (scored(b)) return details(b, me) // scores entered: say so first
    if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.textContent = 'Sure?'; return }
    btn.disabled = true
    if (!(await cancel(b))) btn.disabled = false
  }))
}
