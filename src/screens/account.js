// Account (tap the disc on Home): your shareable handicap card (QR + Share), then player tiles, then (admins only) the
// way into the club office, then account buttons.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, top0, render, toast, fmtHcp } from '../ui.js'
import { passwordSheet } from './login.js'
import { shareText, qrSvg, shareCard } from '../share-card.js'
import { friendLink } from '../friend-link.js'
import { money } from '../fees.js'

export async function load() {
  const me = await api.getMe()
  const [theme, points, requests, teeReqs, hut, balances] = await Promise.all([
    api.getTheme(), api.getGuestPoints(),
    me.admin ? api.getAccessRequests() : [],
    me.admin ? api.getTeeTimeRequests() : [],
    api.getHut(), api.getMyBalances(),
  ])
  return { balances, me, clubName: theme?.name ?? '', waiting: requests.length + teeReqs.filter(r => r.status === 'pending').length, points, hutOn: hut.on }
}

export function draw({ me, clubName, waiting, points, hutOn, balances }) {
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
  <div class="card evsec"><b>I play in</b>
    <div class="seg" role="group" aria-label="I play in"><button data-plays="men" aria-pressed="${me.playsIn === 'men'}">Men’s</button><button data-plays="ladies" aria-pressed="${me.playsIn === 'ladies'}">Ladies’</button></div>
    <span class="hint">${me.playsIn ? 'Competitions → Events shows the club competitions you can enter.' : 'Set this to see the Men’s, Ladies’ and Mixed competitions you can enter.'}</span></div>
  <h3>Balances</h3>
  <div class="agrid">
  ${balances ? `<div class="card balances"><div><span>Competition purse</span><b class="num">${balances.competition == null ? '–' : money(balances.competition)}</b></div><div><span>Clubhouse</span><b class="num">${balances.clubhouse == null ? '–' : money(balances.clubhouse)}</b></div></div>` : ''}
    <button class="atile row slim" data-a="points"><span class="e">🎟️</span><span class="rt"><b>Guest points</b><span>${left} of ${points.allowance} left · ${guests ? `enough for ${guests} guest${guests > 1 ? 's' : ''}` : 'none left this year'}</span></span></button>
  </div>
  <h3>Your account</h3>
  <div class="agrid">
    ${hutOn ? '<button class="atile row" data-a="hutorder"><span class="e">🥪</span><span class="rt"><b>Halfway hut</b><span>Order food and drinks; pay when you collect</span></span></button>' : ''}
    <button class="atile row" data-a="course"><span class="e">⛳</span><span class="rt"><b>Course guide</b><span>Every hole, tees and today's pins</span></span></button>
    <button class="atile row" data-a="mygames"><span class="e">🎯</span><span class="rt"><b>Game preferences</b></span></button>
  </div>
  ${me.admin ? `<h3 class="adminhead">Club admin <span class="hint">only admins see this</span></h3>
  <div class="agrid">
    <button class="atile row" data-a="office"><span class="e">🏛️</span><span class="rt"><b>Club office</b><span>${waiting ? `<b class="reqcount">${waiting} waiting</b> · ` : ''}members, tee sheet, competitions and club settings. Best on an iPad or computer</span></span></button>
  </div>` : ''}
  <h3>Sign-in</h3>
  <div class="bk-btns acct"><button class="ghost" id="chpw">Change password</button><button class="ghost" id="signout">Sign out</button></div>
  </div>`
  $('share').onclick = async () => { const r = await shareCard(card, me.name, link); if (r === 'copied') toast('Details copied: paste them into a message') }
  document.querySelectorAll('[data-plays]').forEach(b => (b.onclick = async () => {
    try { await api.setMyPlaysIn(b.dataset.plays) } catch (err) { toast(err.message); return }
    await render(); toast(`Saved: you play in ${b.dataset.plays === 'men' ? 'Men’s' : 'Ladies’'} competitions`)
  }))
  $('copycard').onclick = async () => {
    try { await navigator.clipboard.writeText(card); toast('Details copied') } catch { toast('Couldn’t copy on this phone: use Share instead') }
  }
  $('signout').onclick = () => api.signOut()
  $('chpw').onclick = () => passwordSheet(ok => ok && toast('Password changed'))
  document.querySelectorAll('[data-a]').forEach(b => (b.onclick = async () => {
    if (b.dataset.a === 'course') { S.tab = 'course'; await render(); top0(); return } // the guide outside a round
    if (b.dataset.a === 'office') { Object.assign(S, { office: true, ov: 'today', aview: 'office', navReset: true }); await render(); top0(); return }
    S.aview = b.dataset.a
    await render()
    top0()
  }))
}
