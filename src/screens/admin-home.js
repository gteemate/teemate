// Admin tab home: tiles for each admin area.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, top0, render, toast } from '../ui.js'
import { passwordSheet } from './login.js'
import { isoDate, today } from '../dates.js'
import { buildLibrary } from '../games.js'

export async function load() {
  const me = await api.getMe()
  const [sheet, bookings, buddies, games, events, points, requests] = await Promise.all([
    api.getTeeSheet(isoDate(today())), api.getMyBookings(), api.getBuddies(), api.getGameSettings(), api.getEvents(), api.getGuestPoints(),
    me.admin ? api.getAccessRequests() : [],
  ])
  return { me, sheet, bookings, buddies, L: buildLibrary(games), active: events.find(e => e.active), points, requests }
}

export function draw({ me, sheet, bookings, buddies, L, active, points, requests }) {
  header('Admin', `Signed in as <b>${esc(me.name)}</b>`)
  const avail = sheet.filter(s => s.players.length < s.capacity).length
  const gamesOn = Object.values(L.lib).filter(x => x.on).length
  const left = points.allowance - points.mine.reduce((t, x) => t + x.points, 0)
  const admin = me.admin
  $('main').innerHTML = `<div class="screen"><div class="agrid">
    <button class="atile hero" data-a="tee"><span class="e">🗓️</span><b>Tee times</b><span>${avail} times free today · book and add buddies</span></button>
    <button class="atile" data-a="mine"><span class="e">📋</span><b>Bookings</b><span>${bookings.length ? `${bookings.length} upcoming` : 'Nothing booked yet'}</span></button>
    <button class="atile" data-a="buddies"><span class="e">👥</span><b>Buddies</b><span>${buddies.length} playing partners</span></button>
    ${admin ? `<button class="atile" data-a="pins"><span class="e">⛳</span><b>Pins</b><span>Set today's flags</span></button>
    <button class="atile" data-a="games"><span class="e">🎯</span><b>Games</b><span>${gamesOn} on · preferred and allowances</span></button>
    <button class="atile row" data-a="events"><span class="e">🏆</span><b>Events</b><span>${active ? `Active: ${esc(active.name)}` : 'Create a team event'}</span></button>` : ''}
    ${admin ? `<button class="atile row" data-a="access"><span class="e">🔑</span><b>Members &amp; access</b><span>${requests.length ? `<b class="reqcount">${requests.length} access request${requests.length > 1 ? 's' : ''}</b>` : 'Choose who can sign in'}</span></button>` : ''}
    ${admin ? '<button class="atile row" data-a="colours"><span class="e">🎨</span><b>Club colours</b><span>Two colours that theme the whole app</span></button>' : ''}
    <button class="atile row" data-a="points"><span class="e">🎟️</span><b>Guest points</b><span>${left} of ${points.allowance} left this year</span></button>
  </div>
  ${admin ? '<div class="hint">Pins, Games, Events and Members &amp; access only show for admins.</div>' : ''}
  <div class="bk-btns"><button class="signout" id="chpw">Change password</button><button class="signout" id="signout">Sign out</button></div></div>`
  $('signout').onclick = () => api.signOut()
  $('chpw').onclick = () => passwordSheet(ok => ok && toast('Password changed'))
  document.querySelectorAll('[data-a]').forEach(b => (b.onclick = async () => {
    S.aview = b.dataset.a
    if (S.aview === 'buddies') { S.bseg = 'mine'; S.bfrom = null }
    if (S.aview === 'access') { S.accEdit = null; S.accQ = '' }
    await render()
    top0()
  }))
}
