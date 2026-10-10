// Home: a remote control. The membership disc at the top of the screen (tap it for Account), four tiles around
// it (Booking, Competition, Friends, Scoring; a tile glows gold when something there needs you), and the date and
// course weather in the header. Nothing else: things that need you drop down from the header (alert-bar.js).
// No tab bar: these tiles and each screen's back arrow are the way around.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, render, top0, fmtHcp } from '../ui.js'
import { isoDate, today, hhmm } from '../dates.js'
import { needsMyAnswer } from '../home-today.js'
import { roundPill } from '../round-pill.js'
import { getWeather } from '../weather.js'
import { buildLibrary, resolveGame, gameSpec, teeRating } from '../games.js'
import { courseHandicap, playingHandicaps, shotsOnHole } from '../scoring.js'

const ICON = {
  booking: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  comp: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 4 4M17 6h3a3 3 0 0 1-4 4M12 14v4M8 21h8"/>',
  friends: '<circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.8"/><path d="M2.5 20c0-4 3-6 6.5-6s6.5 2 6.5 6M15 14c3.5 0 6 1.7 6 5"/>',
  scoring: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
}
const svg = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`

export async function load() {
  const [me, theme, card, teeTimes, playerEvents, friends, requests] = await Promise.all([
    api.getMe(), api.getTheme(), api.getCurrentRound(), api.getMyTeeTimes(today()), api.getMyPlayerEvents(), api.getFriends(), api.getMyTeeTimeRequests(),
  ])
  const date = isoDate(today())
  const invites = playerEvents.filter(e => e.date === date && needsMyAnswer(e, me)).length
  const answered = requests.some(r => (r.status === 'approved' || r.status === 'declined') && !r.seen && r.decidedAt && Date.now() - Date.parse(r.decidedAt) < 7 * 864e5)
  const pill = card ? await cardPill(card) : null
  const loc = theme?.courseLat != null ? { lat: theme.courseLat, lon: theme.courseLon } : null
  return { me, clubName: theme?.name ?? '', card, pill, tee: teeTimes[0], friendCount: friends.buddies.length + friends.contacts.length, invites, answered, loc }
}

// "Hole 4 · +1": my shots per hole worked out as the scorecard does (scores.js), so net games show net.
async function cardPill(card) {
  const [course, members, games, guests] = await Promise.all([api.getCourse(), api.getMembers(), api.getGameSettings(),
    api.getGuests(card.lineup.filter(e => e.g != null).map(e => e.g))])
  const hcps = card.lineup.map(e => (e.m != null ? members.find(m => m.id === e.m)?.hcp : guests.find(g => g.id === e.g)?.hcp) ?? 0)
  const L = buildLibrary(games), G = gameSpec(L.lib[resolveGame(L, card.game, hcps.length)])
  const ph = playingHandicaps(hcps.map(h => courseHandicap(h, teeRating(course))), G.allow, G.offLow)
  return roundPill({
    done: card.done, gross: course.holes.map((_, i) => card.scores[i]?.[0] ?? null), pars: course.holes.map(h => h.par),
    shots: course.holes.map(h => (G.allow ? shotsOnHole(ph[0], h.si) : 0)), finished: !!card.submitted?.[card.game],
  })
}

const WIND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h8"/></svg>'
const RAIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 15a4 4 0 0 1-.5-8A6 6 0 0 1 18 8a3.5 3.5 0 0 1 0 7z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/></svg>'

// The remote is a square from the shorter side of the space under the header (clear of the edges, at most 520px).
let watching = null
function fitRemote() {
  const main = $('main'), box = main.querySelector('.screen.home')
  if (!box) return
  box.style.setProperty('--q', `${Math.max(200, Math.min(main.clientWidth - 32, main.clientHeight - 24, 520))}px`)
  if (!watching) { watching = new ResizeObserver(() => fitRemote()); watching.observe(main) }
}

export function draw({ me, clubName, card, pill, tee, friendCount, invites, answered, loc }) {
  $('hdr').innerHTML = `<div class="homehdr"><div class="homedate">${today().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div><button class="hwx" id="hwx" hidden></button></div>`
  const tile = (k, label, sub, cls = '', extra = '') => `<button class="htile ${cls}" data-tile="${k}"><span class="hic">${svg(k)}${extra}</span><span class="hlb">${label}<small>${sub}</small></span></button>`
  $('main').innerHTML = `<div class="screen home">
    <div class="hquad">
      ${tile('booking', 'Booking', answered ? 'Request answered' : tee ? `${hhmm(tee.time)} today` : 'Book a tee time', answered ? 'glow' : '')}
      ${tile('comp', 'Competition', invites ? `${invites} invitation${invites > 1 ? 's' : ''}` : 'Your competitions', `r${invites ? ' glow' : ''}`)}
      ${tile('friends', 'Friends', `${friendCount} friend${friendCount === 1 ? '' : 's'}`, 'b')}
      ${tile('scoring', 'Scoring', card ? 'Round on the go' : tee ? `${hhmm(tee.time)} today` : 'Start a round', 'r b', pill ? `<span class="hpill">${esc(pill.replace(/ · .*/, ''))} <i>· ${esc(pill.replace(/.* · /, ''))}</i></span>` : '')}
      <button class="hdisc" id="account" aria-label="Your membership card. Opens your account">
        <span class="nm">${esc(me.name)}</span>${clubName ? `<span class="cl">${esc(clubName)}</span>` : ''}
        <span class="hi num">${fmtHcp(me.hcp)}</span><span class="gu">HI · ${me.gui ? `GUI ${esc(me.gui)}` : 'GUI not added'}</span>
      </button>
    </div>
  </div>`
  fitRemote()
  const go = async f => { f(); await render(); top0() }
  $('account').onclick = () => go(() => { S.aview = 'account' })
  const TILE = {
    booking: () => { S.aview = 'mine' },
    comp: () => { S.aview = 'comp' },
    friends: () => { S.aview = 'buddies'; S.bseg = 'mine'; S.bfrom = null },
    scoring: () => { S.tab = 'scores'; S.sview = 'card' },
  }
  document.querySelectorAll('[data-tile]').forEach(b => (b.onclick = () => go(TILE[b.dataset.tile])))
  $('hwx').onclick = () => go(() => { S.aview = 'weather' })
  // The weather fills in when it arrives (never holds up Home); nothing shows without a course location.
  getWeather(loc).then(w => {
    const b = $('hwx')
    if (!w || !b) return
    b.innerHTML = `<span>${WIND}${w.windMph} mph</span><span>${RAIN}${w.rainMm} mm</span>`
    b.setAttribute('aria-label', `Weather: wind ${w.windMph} miles an hour, ${w.rainMm} millimetres of rain today`)
    b.hidden = false
  })
}
