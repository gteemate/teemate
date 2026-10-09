// Home tab: the membership card (tap it for Account: bookings, buddies, events, club admin), what's on
// for me today (see home-today.js), and one big Book a tee time button.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, render, top0, fmtHcp } from '../ui.js'
import { isoDate, today } from '../dates.js'
import { todayItems } from '../home-today.js'

const ICON = { invite: '🏆', card: '📝', tee: '🗓️', match: '🏆', event: '🏅' }
const GO = { invite: 'Open', card: 'Open', tee: 'Open', match: 'Board', event: 'Board' }

export async function load() {
  const [me, theme, card, teeTimes, playerEvents, events] = await Promise.all([
    api.getMe(), api.getTheme(), api.getCurrentRound(), api.getMyTeeTimes(today()), api.getMyPlayerEvents(), api.getEvents(),
  ])
  return { me, clubName: theme?.name ?? '', items: todayItems({ me, card, teeTimes, playerEvents, events, date: isoDate(today()) }) }
}

export function draw({ me, clubName, items }) {
  $('hdr').innerHTML = `<div class="homedate">${today().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>` // just the date: the card says the rest
  const row = (x, n) => `<button class="${x.kind === 'invite' ? 'wait' : x.pill ? 'live' : ''}" data-i="${n}"><span class="e" aria-hidden="true">${ICON[x.kind]}</span>
    <span><strong>${esc(x.title)}${x.pill ? `<span class="pill${x.pill.gold ? ' gold' : ''}">${esc(x.pill.text)}</span>` : ''}</strong><small>${esc(x.detail)}</small></span>
    <span class="go">${GO[x.kind]}</span></button>`
  $('main').innerHTML = `<div class="screen">
    <button class="mbadge" id="account" aria-label="Membership card. Opens bookings, buddies, events, games and your account">
      ${clubName ? `<span class="mb-club">${esc(clubName)}</span>` : ''}
      <span class="mb-nm">${esc(me.name)}</span>
      <span class="mb-rule" aria-hidden="true"></span>
      <span class="mb-fx"><span>Handicap index ${fmtHcp(me.hcp)}</span> · <span>${me.gui ? `GUI ${esc(me.gui)}` : 'GUI not added'}</span></span>
      <span class="mb-more">Bookings, buddies, events &amp; account ›</span>
    </button>
    <h3>Today</h3>
    ${items.length ? `<div class="today">${items.map(row).join('')}</div>` : '<div class="empty-state">Nothing on today</div>'}
    <button class="bookbtn" id="book">Book a tee time</button>
  </div>`
  const go = async view => { S.aview = view; await render(); top0() }
  $('account').onclick = () => go('account')
  $('book').onclick = () => go('tee')
  document.querySelectorAll('.today [data-i]').forEach(b => (b.onclick = async () => {
    const g = items[+b.dataset.i].go
    S.tab = g.tab
    if (g.tab === 'scores') { S.sview = g.sview ?? 'card'; if (g.peId) S.peId = g.peId }
    if (g.lbv) S.lbv = g.lbv
    await render()
    top0()
  }))
}
