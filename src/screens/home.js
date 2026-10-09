// Home: the membership disc (tap it for Account), four tiles (Booking, Competition, Friends, Scoring;
// a tile glows gold when something there needs you), then Next up and anything waiting for you.
// No tab bar: these tiles and each screen's back arrow are the way around.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, render, top0, fmtHcp } from '../ui.js'
import { isoDate, today, hhmm } from '../dates.js'
import { todayItems, nextUp } from '../home-today.js'

const ICON = {
  booking: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  comp: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 4 4M17 6h3a3 3 0 0 1-4 4M12 14v4M8 21h8"/>',
  friends: '<circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.8"/><path d="M2.5 20c0-4 3-6 6.5-6s6.5 2 6.5 6M15 14c3.5 0 6 1.7 6 5"/>',
  scoring: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
}
const svg = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`

export async function load() {
  const [me, theme, card, teeTimes, playerEvents, events, buddies, requests] = await Promise.all([
    api.getMe(), api.getTheme(), api.getCurrentRound(), api.getMyTeeTimes(today()), api.getMyPlayerEvents(), api.getEvents(), api.getBuddies(), api.getMyTeeTimeRequests(),
  ])
  const items = todayItems({ me, card, teeTimes, playerEvents, events, requests, date: isoDate(today()) })
  return { me, clubName: theme?.name ?? '', items, card, teeTimes, buddies }
}

export function draw({ me, clubName, items, card, teeTimes, buddies }) {
  $('hdr').innerHTML = `<div class="homedate">${today().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>`
  const { next, needs, more } = nextUp(items)
  const tee = teeTimes[0]
  const invites = needs.filter(x => x.kind === 'invite').length, answered = needs.some(x => x.kind === 'request')
  const tile = (k, label, sub, cls = '') => `<button class="htile ${cls}" data-tile="${k}">${svg(k)}<span>${label}<small>${sub}</small></span></button>`
  const row = (x, n, cls) => `<button class="card hnext ${cls}" data-i="${n}"><span class="kick">${cls === 'needs' ? 'Needs you' : n === 0 ? 'Next up' : 'Also today'}</span>
    <span class="hnt">${esc(x.title)}</span><span class="sub">${esc(x.detail)}${x.pill && cls !== 'needs' ? ` · ${esc(x.pill.text)}` : ''}</span></button>`
  const list = [...needs.map(x => ['needs', x]), ...(next ? [['next', next]] : []), ...more.map(x => ['more', x])]
  $('main').innerHTML = `<div class="screen">
    <div class="hquad">
      ${tile('booking', 'Booking', answered ? 'Request answered' : tee ? `${hhmm(tee.time)} today` : 'Book a tee time', answered ? 'glow' : '')}
      ${tile('comp', 'Competition', invites ? `${invites} invitation${invites > 1 ? 's' : ''}` : 'Your competitions', `r${invites ? ' glow' : ''}`)}
      ${tile('friends', 'Friends', `${buddies.length} playing partner${buddies.length === 1 ? '' : 's'}`, 'b')}
      ${tile('scoring', 'Scoring', card ? 'Round on the go' : tee ? `${hhmm(tee.time)} today` : 'Start a round', 'r b')}
      <button class="hdisc" id="account" aria-label="Your membership card. Opens your account">
        <span class="nm">${esc(me.name)}</span>${clubName ? `<span class="cl">${esc(clubName)}</span>` : ''}
        <span class="hi num">${fmtHcp(me.hcp)}</span><span class="gu">HI · ${me.gui ? `GUI ${esc(me.gui)}` : 'GUI not added'}</span>
      </button>
    </div>
    ${list.length ? list.map(([cls, x]) => row(x, cls === 'next' ? 0 : 1, cls)).join('') : '<div class="empty-state">Nothing on today</div>'}
  </div>`
  const go = async f => { f(); await render(); top0() }
  $('account').onclick = () => go(() => { S.aview = 'account' })
  const TILE = {
    booking: () => { S.aview = 'mine' },
    comp: () => { S.aview = 'comp' },
    friends: () => { S.aview = 'buddies'; S.bseg = 'mine'; S.bfrom = null },
    scoring: () => { S.tab = 'scores'; S.sview = 'card' },
  }
  document.querySelectorAll('[data-tile]').forEach(b => (b.onclick = () => go(TILE[b.dataset.tile])))
  const all = list.map(([, x]) => x)
  document.querySelectorAll('.hnext').forEach((b, n) => (b.onclick = () => go(() => {
    const g = all[n].go
    S.tab = g.tab
    if (g.aview) S.aview = g.aview
    if (g.tab === 'scores') { S.sview = g.sview ?? 'card'; if (g.peId) S.peId = g.peId }
    if (g.lbv) S.lbv = g.lbv
  })))
}
