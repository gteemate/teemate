// Admin tab home: player tiles first, then a Club admin section (admins only), then account buttons.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, top0, render, toast } from '../ui.js'
import { passwordSheet } from './login.js'
import { isoDate, today, eventLastDay } from '../dates.js'
import { buildLibrary, preferredGame } from '../games.js'
import { bar } from './booking.js'

export async function load() {
  const me = await api.getMe()
  const [sheet, bookings, buddies, games, events, points, requests] = await Promise.all([
    api.getTeeSheet(isoDate(today())), api.getMyBookings(), api.getBuddies(), api.getGameSettings(), api.getEvents(), api.getGuestPoints(),
    me.admin ? api.getAccessRequests() : [],
  ])
  const upcoming = events.filter(e => eventLastDay(e) >= isoDate(today())).length
  return { me, sheet, bookings, buddies, L: buildLibrary(games), upcoming, points, requests }
}

export function draw({ me, sheet, bookings, buddies, L, upcoming, points, requests }) {
  header('Admin', `Signed in as <b>${esc(me.name)}</b>`)
  const avail = sheet.filter(s => s.players.length < s.capacity).length
  const gamesOn = Object.values(L.lib).filter(x => x.on).length
  const used = points.mine.reduce((t, x) => t + x.points, 0), left = points.allowance - used
  const guests = Math.floor(left / points.cost)
  // Player items first (what every member sees), then admin-only items in one section at the end.
  $('main').innerHTML = `<div class="screen">
  <div class="agrid">
    <button class="atile hero" data-a="tee"><span class="e">🗓️</span><b>Tee times</b><span>${avail} times free today · book and add buddies</span></button>
    <button class="card ptsbox ptstile" data-a="points">
      <div class="ptsrow"><span><b>🎟️ Guest points</b><small>${points.allowance} a year · ${points.cost} per guest on the ${esc(points.course)}</small></span><span class="ptsnum">${left}<small> left</small></span></div>
      ${bar(left, points.allowance)}
      <span class="hint">${guests ? `Enough for ${guests} more guest${guests > 1 ? 's' : ''} this year` : 'No guest points left this year'} · tap for your guests</span>
    </button>
    <button class="atile" data-a="mine"><span class="e">📋</span><b>Bookings</b><span>${bookings.length ? `${bookings.length} upcoming` : 'Nothing booked yet'}</span></button>
    <button class="atile" data-a="buddies"><span class="e">👥</span><b>Buddies</b><span>${buddies.length} playing partners</span></button>
    <button class="atile row" data-a="events"><span class="e">🏆</span><span class="rt"><b>Events</b><span>${upcoming ? `${upcoming} coming up · set one up for your group` : 'Set up a match or competition in advance'}</span></span></button>
    <button class="atile row" data-a="mygames"><span class="e">🎯</span><span class="rt"><b>Games</b><span>Your game for 2, 3 and 4 players: ${[2, 3, 4].map(n => esc(L.lib[preferredGame(L, n)]?.name ?? '–')).join(' · ')}</span></span></button>
  </div>
  ${me.admin ? `<h3 class="adminhead">Club admin <span class="hint">only admins see this</span></h3>
  <div class="agrid">
    <button class="atile row" data-a="access"><span class="e">🔑</span><span class="rt"><b>Members &amp; access</b><span>${requests.length ? `<b class="reqcount">${requests.length} access request${requests.length > 1 ? 's' : ''}</b>` : 'Choose who can sign in'}</span></span></button>
    <button class="atile row" data-a="colours"><span class="e">🎨</span><span class="rt"><b>Club colours</b><span>Two colours that theme the whole app</span></span></button>
    <button class="atile" data-a="pins"><span class="e">⛳</span><b>Pins</b><span>Set today's flags</span></button>
    <button class="atile" data-a="games"><span class="e">⚙️</span><b>Club games</b><span>${gamesOn} on · allowances</span></button>
  </div>` : ''}
  <h3>Your account</h3>
  <div class="bk-btns acct"><button class="ghost" id="chpw">Change password</button><button class="ghost" id="signout">Sign out</button></div>
  </div>`
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
