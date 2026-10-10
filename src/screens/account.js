// Account (tap the disc on Home): your shareable handicap card (QR + Share), then player tiles, then a Club admin section
// (admins only), then account buttons.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, top0, render, toast, fmtHcp } from '../ui.js'
import { passwordSheet } from './login.js'
import { isoDate, today, eventLastDay } from '../dates.js'
import { buildLibrary } from '../games.js'
import { timeLabel } from '../release.js'
import { shareText, qrSvg, shareCard } from '../share-card.js'
import { friendLink } from '../friend-link.js'

export async function load() {
  const me = await api.getMe()
  const [theme, bookings, friends, games, events, points, requests, rules, teeReqs, matches, hut] = await Promise.all([
    api.getTheme(), api.getMyBookings(), api.getFriends(), api.getGameSettings(), api.getEvents(), api.getGuestPoints(),
    me.admin ? api.getAccessRequests() : [],
    me.admin ? api.getBookingRules() : null,
    me.admin ? api.getTeeTimeRequests() : [],
    api.getMyPlayerEvents(),
    api.getHut(),
  ])
  const live = events.filter(e => eventLastDay(e) >= isoDate(today()))
  // events set up in advance, plus matches set up on the day from the Scores tab
  const upcoming = live.filter(e => !e.club && e.style !== 'league').length + matches.filter(e => e.status === 'pending' || e.status === 'accepted').length, clubEvents = live.filter(e => e.club || e.style === 'league').length
  return { me, clubName: theme?.name ?? '', rules, waitingReqs: teeReqs.filter(r => r.status === 'pending').length, bookings, friendCount: friends.buddies.length + friends.contacts.length, L: buildLibrary(games), upcoming, clubEvents, points, requests, hutOn: hut.on }
}

export function draw({ me, clubName, rules, waitingReqs, bookings, friendCount, L, upcoming, clubEvents, points, requests, hutOn }) {
  header('Account', `Signed in as <b>${esc(me.name)}</b>`, async () => { S.aview = 'home'; await render(); top0() }, 'Home')
  const link = friendLink(me, clubName, location.origin + import.meta.env.BASE_URL), card = shareText(me, clubName, link)
  const used = points.mine.reduce((t, x) => t + x.points, 0), left = points.allowance - used
  const guests = Math.floor(left / points.cost)
  // Player items first (what every member sees), then admin-only items in one section at the end.
  $('main').innerHTML = `<div class="screen">
  ${me.hutStaff || (me.admin && hutOn) ? `<button class="atile row hutstafftile" data-a="hutstaff"><span class="e">🥪</span><span class="rt"><b>Halfway hut orders</b><span>${hutOn ? 'Today’s orders: mark them ready' : 'Ordering is off'}</span></span></button>` : ''}
  <div class="sharecard">
    <div class="qr" role="img" aria-label="QR code: your friend link with your handicap details">${qrSvg(link)}</div>
    <div class="sc-nm">${esc(me.name)}</div>${clubName ? `<div class="sc-cl">${esc(clubName)}</div>` : ''}
    <div class="sc-fx"><span>Handicap index <b class="num">${fmtHcp(me.hcp)}</b></span><span>${me.gui ? `GUI <b class="num">${esc(me.gui)}</b>` : 'GUI not added'}</span></div>
    <div class="sc-up">Scan it or share it: it opens TeeMate to add you as a friend</div>
  </div>
  <div class="bk-btns"><button class="primary" id="share">Share</button><button class="ghost" id="copycard">Copy details</button></div>
  <h3>Your account</h3>
  <div class="agrid">
    <button class="atile" data-a="mine"><span class="e">📋</span><b>Bookings</b><span>${bookings.length ? `${bookings.length} upcoming` : 'Nothing booked yet'}</span></button>
    <button class="atile" data-a="buddies"><span class="e">👥</span><b>Friends</b><span>${friendCount} friend${friendCount === 1 ? '' : 's'}</span></button>
    <button class="atile row" data-a="events"><span class="e">🏆</span><span class="rt"><b>Events</b><span>${upcoming ? `${upcoming} coming up · set one up for your group` : 'Set up a match or competition in advance'}</span></span></button>
    ${hutOn ? '<button class="atile row" data-a="hutorder"><span class="e">🥪</span><span class="rt"><b>Halfway hut</b><span>Order food and drinks; pay when you collect</span></span></button>' : ''}
    <button class="atile row" data-a="course"><span class="e">⛳</span><span class="rt"><b>Course guide</b><span>Every hole, tees and today's pins</span></span></button>
    <button class="atile row" data-a="mygames"><span class="e">🎯</span><span class="rt"><b>Games</b></span></button>
    <button class="atile row slim" data-a="points"><span class="e">🎟️</span><span class="rt"><b>Guest points</b><span>${left} of ${points.allowance} left · ${guests ? `enough for ${guests} guest${guests > 1 ? 's' : ''}` : 'none left this year'}</span></span></button>
  </div>
  ${me.admin ? `<h3 class="adminhead">Club admin <span class="hint">only admins see this</span></h3>
  <div class="agrid">
    <button class="atile row" data-a="clubevents"><span class="e">🏆</span><span class="rt"><b>Club events</b><span>${clubEvents ? `${clubEvents} running or coming up · ` : ''}club-wide events and leagues</span></span></button>
    <button class="atile row" data-a="treq"><span class="e">📨</span><span class="rt"><b>Tee time requests</b><span>${waitingReqs ? `<b class="reqcount">${waitingReqs} waiting</b>` : 'Members asking for days not open yet'}</span></span></button>
    <button class="atile row" data-a="access"><span class="e">🔑</span><span class="rt"><b>Members &amp; access</b><span>${requests.length ? `<b class="reqcount">${requests.length} access request${requests.length > 1 ? 's' : ''}</b>` : 'Choose who can sign in'}</span></span></button>
    <button class="atile row" data-a="rules"><span class="e">⏰</span><span class="rt"><b>Booking rules</b><span>${rules ? `Tee times open ${timeLabel(rules.time)}, ${rules.days} day${rules.days === 1 ? '' : 's'} before · ${rules.weekendsOnly ? 'weekends only' : 'every day'}` : 'When tee times open for booking'}</span></span></button>
    <button class="atile row" data-a="colours"><span class="e">🎨</span><span class="rt"><b>Club name &amp; colours</b><span>The name on the membership card, and two colours that theme the app</span></span></button>
    <button class="atile row" data-a="hutadmin"><span class="e">🥪</span><span class="rt"><b>Halfway hut</b><span>Ordering after hole 8: switch it on, the menu, hut staff</span></span></button>
    <button class="atile row" data-a="pins"><span class="e">⛳</span><span class="rt"><b>Pins</b><span>Set today's flags</span></span></button>
  </div>` : ''}
  <h3>Your account</h3>
  <div class="bk-btns acct"><button class="ghost" id="chpw">Change password</button><button class="ghost" id="signout">Sign out</button></div>
  </div>`
  $('share').onclick = async () => { const r = await shareCard(card, me.name, link); if (r === 'copied') toast('Details copied: paste them into a message') }
  $('copycard').onclick = async () => {
    try { await navigator.clipboard.writeText(card); toast('Details copied') } catch { toast('Couldn’t copy on this phone: use Share instead') }
  }
  $('signout').onclick = () => api.signOut()
  $('chpw').onclick = () => passwordSheet(ok => ok && toast('Password changed'))
  document.querySelectorAll('[data-a]').forEach(b => (b.onclick = async () => {
    if (b.dataset.a === 'course') { S.tab = 'course'; await render(); top0(); return } // the guide outside a round
    S.aview = b.dataset.a
    if (S.aview === 'events') S.evScope = 'player'
    if (S.aview === 'clubevents') { S.evScope = 'club'; S.aview = 'events' }
    if (S.aview === 'buddies') { S.bseg = 'mine'; S.bfrom = null }
    if (S.aview === 'access') { S.accEdit = null; S.accQ = '' }
    await render()
    top0()
  }))
}
