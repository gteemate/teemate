// Admin → Bookings: my upcoming rounds. Swipe one left to delete it (if I made it; guest points come
// back) or to withdraw (if someone else booked me in).
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, keepScroll, render, toast } from '../ui.js'
import { fromIso, longDay, hhmm } from '../dates.js'
import { toAdmin } from './nav.js'
import { bindSwipes, swipeSwallowsClick } from '../swipe.js'

export async function load() {
  return { bookings: await api.getMyBookings() }
}

export function draw({ bookings }) {
  header('Bookings', bookings.length ? `<b>${bookings.length}</b> upcoming` : 'Nothing booked yet', toAdmin)
  $('main').innerHTML = `<div class="screen">${bookings.length
    ? `<div class="card list">${bookings.map(b => `<div class="swipe"><button class="swdel" data-cancel="${b.id}">${b.mine ? 'Delete' : 'Withdraw'}</button>
        <div class="lrow swrow bkrow" data-swipe data-bk="${b.id}"><span style="font-size:22px;font-weight:800">${hhmm(b.time)}</span><span class="who"><strong>${longDay(fromIso(b.date))}</strong><small>${b.players.map(esc).join(', ')}</small></span></div></div>`).join('')}</div>
      <div class="hint">Swipe a booking left to delete it${bookings.some(b => !b.mine) ? ', or to withdraw from one someone else made for you' : ''}. Guest points come back when you delete a booking with guests.</div>`
    : '<div class="empty-state">No upcoming rounds.<br>Book a tee time and it will show here.</div><button class="primary" id="bt">Book a tee time</button>'}</div>`
  const bt = $('bt')
  if (bt) bt.onclick = () => { S.aview = 'tee'; render() }
  bindSwipes()
  document.querySelectorAll('[data-bk]').forEach(r => (r.onclick = () => swipeSwallowsClick(r)))
  document.querySelectorAll('[data-cancel]').forEach(btn => (btn.onclick = async () => {
    const b = bookings.find(x => x.id === +btn.dataset.cancel)
    if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.textContent = 'Sure?'; return }
    btn.disabled = true
    let r
    try {
      r = await api.cancelBooking(b.id)
    } catch (err) {
      toast(err.message)
      btn.disabled = false
      return
    }
    await keepScroll(render)
    toast(r.result === 'deleted'
      ? `${hhmm(b.time)} booking deleted${r.pointsBack ? ` · ${r.pointsBack} guest points back` : ''}`
      : `You’ve withdrawn from the ${hhmm(b.time)} booking`)
  }))
}
