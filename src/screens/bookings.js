// Admin → Bookings: my upcoming rounds. Tap one for who's playing; delete it (if I made it; guest
// points come back) or withdraw (if someone else booked me in) from there, or by swiping it left.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, header, keepScroll, render, toast, fmtHcp } from '../ui.js'
import { fromIso, longDay, hhmm } from '../dates.js'
import { toAdmin } from './nav.js'
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
  header('Bookings', bookings.length ? `<b>${bookings.length}</b> upcoming` : 'Nothing booked yet', toAdmin)
  $('main').innerHTML = `<div class="screen">${bookings.length
    ? `<div class="card list">${bookings.map(b => `<div class="swipe"><button class="swdel" data-cancel="${b.id}">${b.mine ? 'Delete' : 'Withdraw'}</button>
        <div class="lrow swrow bkrow" data-swipe data-bk="${b.id}"><span style="font-size:22px;font-weight:800">${hhmm(b.time)}</span><span class="who"><strong>${longDay(fromIso(b.date))}</strong><small>${b.players.map(esc).join(', ')}</small></span></div></div>`).join('')}</div>
      <div class="hint">Tap a booking to see who’s playing. Swipe it left to delete it${bookings.some(b => !b.mine) ? ', or to withdraw from one someone else made for you' : ''}. Guest points come back when you delete a booking with guests.</div>`
    : '<div class="empty-state">No upcoming rounds.<br>Book a tee time and it will show here.</div><button class="primary" id="bt">Book a tee time</button>'}</div>`
  const bt = $('bt')
  if (bt) bt.onclick = () => { S.aview = 'tee'; render() }
  bindSwipes()
  document.querySelectorAll('[data-bk]').forEach(r => (r.onclick = () => { if (!swipeSwallowsClick(r)) details(bookings.find(b => b.id === +r.dataset.bk), me) }))
  document.querySelectorAll('[data-cancel]').forEach(btn => (btn.onclick = async () => {
    const b = bookings.find(x => x.id === +btn.dataset.cancel)
    if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.textContent = 'Sure?'; return }
    btn.disabled = true
    if (!(await cancel(b))) btn.disabled = false
  }))
}
