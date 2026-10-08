// Admin → Bookings: my upcoming rounds.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, render } from '../ui.js'
import { fromIso, longDay, hhmm } from '../dates.js'
import { toAdmin } from './nav.js'

export async function load() {
  return { bookings: await api.getMyBookings() }
}

export function draw({ bookings }) {
  header('Bookings', bookings.length ? `<b>${bookings.length}</b> upcoming` : 'Nothing booked yet', toAdmin)
  $('main').innerHTML = `<div class="screen">${bookings.length
    ? `<div class="card list">${bookings.map(b => `<div class="lrow" style="grid-template-columns:70px 1fr"><span style="font-size:22px;font-weight:800">${hhmm(b.time)}</span><span class="who"><strong>${longDay(fromIso(b.date))}</strong><small>${b.players.map(esc).join(', ')}</small></span></div>`).join('')}</div>`
    : '<div class="empty-state">No upcoming rounds.<br>Book a tee time and it will show here.</div><button class="primary" id="bt">Book a tee time</button>'}</div>`
  const bt = $('bt')
  if (bt) bt.onclick = () => { S.aview = 'tee'; render() }
}
