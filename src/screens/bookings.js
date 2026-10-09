// Booking (the Booking tile on Home): my upcoming rounds, then + Add a booking (the tee sheet). Tap one for who's playing; delete it (if I made it; guest
// points come back) or withdraw (if someone else booked me in) from there, or by swiping it left.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, header, keepScroll, render, toast, fmtHcp, top0 } from '../ui.js'
import { DN, fromIso, longDay, hhmm, isoDate, today } from '../dates.js'
import { bindSwipes, swipeSwallowsClick } from '../swipe.js'
import { resetRound } from './scores.js'

export async function load() {
  const [bookings, me] = await Promise.all([api.getMyBookings(), api.getMe()])
  return { bookings, me }
}

async function cancel(b) {
  let r
  try {
    r = await api.cancelBooking(b.id)
  } catch (err) {
    toast(err.message)
    return false
  }
  resetRound() // Scores reloads, in case the card for that tee time went too
  await keepScroll(render)
  toast(r.result === 'deleted'
    ? `${hhmm(b.time)} booking deleted${r.pointsBack ? ` · ${r.pointsBack} guest points back` : ''}`
    : `You’ve withdrawn from the ${hhmm(b.time)} booking`)
  return true
}

// Booking details: everyone on the tee time, and delete / withdraw.
function details(b, me) {
  const person = p => `<div class="lrow"><span class="av${p.guest ? ' gst' : ''}">${ini(p.name)}</span><span class="who"><strong>${esc(p.name)}${p.memberId === me.id ? ' (you)' : ''}</strong><small>${p.guest ? `Guest${p.club ? ' · ' + esc(p.club) : ''}` : 'Member'}</small></span><span class="hcp">${fmtHcp(p.hcp == null ? null : Number(p.hcp))}<small>HI</small></span></div>`
  const ours = b.people.filter(p => p.inBooking), others = b.people.filter(p => !p.inBooking)
  const act = b.mine ? 'Delete booking' : 'Withdraw from this booking'
  $('modal').innerHTML = `<div class="overlay" id="ovl"><div class="sheet" role="dialog" aria-labelledby="bkt">
    <span class="kicker">${longDay(fromIso(b.date))}</span>
    <h4 id="bkt">${hhmm(b.time)} · 1st tee</h4>
    <span class="hint">${b.mine ? 'You booked this' : `Booked by ${esc(b.bookedBy ?? 'another member')}`}</span>
    <div class="card list">${ours.map(person).join('')}</div>
    ${others.length ? `<span class="hint">Also on this tee time</span><div class="card list">${others.map(person).join('')}</div>` : ''}
    <span class="hint">${b.mine ? `Deleting takes everyone in your booking off this time${b.guests ? ' and gives your guest points back' : ''}.` : 'Withdrawing takes just you off. The rest of the booking stays.'} A scorecard for it goes too, unless holes have been saved.</span>
    <div class="gm-btns"><button type="button" class="ghost" id="bk-close">Close</button><button class="primary" id="bk-act">${act}</button></div>
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

export function draw({ bookings, me }) {
  header('Booking', bookings.length ? `<b>${bookings.length}</b> coming up` : 'Nothing booked yet')
  const who = b => b.people.filter(p => p.inBooking).map(p => (p.memberId === me.id ? 'You' : p.name) + (p.guest ? ' (guest)' : '')).join(', ')
  const day = b => { const d = fromIso(b.date); return `<span class="bk-d"><b class="num">${d.getDate()}</b><small>${b.date === isoDate(today()) ? 'Today' : DN[d.getDay()]}</small></span>` }
  $('main').innerHTML = `<div class="screen">${bookings.length
    ? `<span class="kicker">Coming up</span>
      <div class="bklist">${bookings.map(b => `<div class="swipe"><button class="swdel" data-cancel="${b.id}">${b.mine ? 'Delete' : 'Withdraw'}</button>
        <div class="card bk swrow" data-swipe data-bk="${b.id}">${day(b)}<span class="bk-m"><span class="bk-t num">${hhmm(b.time)}</span><span class="sub">${esc(who(b))}</span></span>${b.mine ? '' : `<span class="pill">Booked by ${esc((b.bookedBy ?? 'a member').split(' ')[0])}</span>`}</div></div>`).join('')}</div>
      <div class="hint">Tap a booking to see who’s playing. Swipe it left to delete it${bookings.some(b => !b.mine) ? ', or to withdraw from one someone else made for you' : ''}. Guest points come back when you delete.</div>`
    : '<div class="empty-state">No upcoming rounds.<br>Add a booking and it will show here.</div>'}
    <button class="primary" id="bt">+ Add a booking</button></div>`
  const bt = $('bt')
  if (bt) bt.onclick = async () => { S.aview = 'tee'; await render(); top0() }
  bindSwipes()
  document.querySelectorAll('[data-bk]').forEach(r => (r.onclick = () => { if (!swipeSwallowsClick(r)) details(bookings.find(b => b.id === +r.dataset.bk), me) }))
  document.querySelectorAll('[data-cancel]').forEach(btn => (btn.onclick = async () => {
    const b = bookings.find(x => x.id === +btn.dataset.cancel)
    if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.textContent = 'Sure?'; return }
    btn.disabled = true
    if (!(await cancel(b))) btn.disabled = false
  }))
}
