// Booking confirmation.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, render } from '../ui.js'
import { fromIso, longDay, hhmm } from '../dates.js'
import { toAdmin } from './nav.js'

export async function load() {
  return { points: await api.getGuestPoints() }
}

export function draw({ points }) {
  const b = S.lastBooking
  const left = points.allowance - points.mine.reduce((t, x) => t + x.points, 0)
  header('Booked', '', toAdmin)
  $('main').innerHTML = `<div class="done"><div class="flagmark">⛳</div><h4>You're on the tee</h4>
   <p>${longDay(fromIso(b.date))} at ${hhmm(b.time)}<br>${b.players.map(esc).join(', ')}</p>
   ${b.guests ? `<p class="hint"><b style="color:var(--ink)">${b.pointsUsed} guest points used.</b> You have ${left} of ${points.allowance} left this year.</p>` : ''}
   <p class="hint">Your playing partners get a notification and can withdraw up to 24 hours before.</p>
   <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap;justify-content:center"><button class="ghost" id="mb">My bookings</button><button class="primary" id="bk">Book another</button></div></div>`
  $('mb').onclick = () => { S.aview = 'mine'; render() }
  $('bk').onclick = () => { S.aview = 'tee'; render() }
}
