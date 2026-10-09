// Home tab: the membership card (tap it for Account: bookings, buddies, events, club admin), what's on
// for me today (see home-today.js), and one big Book a tee time button.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, render, top0, fmtHcp } from '../ui.js'
import { isoDate, today, longDay } from '../dates.js'
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
  header('TeeMate', longDay(today()))
  const row = (x, n) => `<button class="${x.kind === 'invite' ? 'wait' : x.pill ? 'live' : ''}" data-i="${n}"><span class="e" aria-hidden="true">${ICON[x.kind]}</span>
    <span><strong>${esc(x.title)}${x.pill ? `<span class="pill${x.pill.gold ? ' gold' : ''}">${esc(x.pill.text)}</span>` : ''}</strong><small>${esc(x.detail)}</small></span>
    <span class="go">${GO[x.kind]}</span></button>`
  $('main').innerHTML = `<div class="screen">
    <button class="card-m" id="account" aria-label="Membership card. Opens bookings, buddies, events, games and your account">
      <span class="top"><span>${esc(clubName)}</span><span>${me.admin ? 'Admin' : 'Member'}</span></span>
      <span class="nm">${esc(me.name)}</span>
      <span class="mfacts"><span><small>Handicap index</small><b>${fmtHcp(me.hcp)}</b></span>
        <span><small>GUI number</small>${me.gui ? `<b>${esc(me.gui)}</b>` : '<span class="muted">Not added</span>'}</span></span>
      <span class="more">Bookings, buddies, events &amp; account <span aria-hidden="true">›</span></span>
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
