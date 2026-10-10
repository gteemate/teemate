import './styles.css'
import { S } from './state.js'
import * as api from './api.js'
import { $, esc, header, setRender, setDefaultBack, toast, top0 } from './ui.js'
import { navStack } from './nav-stack.js'
import * as login from './screens/login.js'
import * as colours from './screens/colours.js'
import * as bookingRules from './screens/booking-rules.js'
import * as competitions from './screens/competitions.js'
import * as scoringRound from './screens/scoring-round.js'
import * as teeRequests from './screens/tee-requests.js'
import { applyTheme, cachedTheme } from './theme.js'
import * as scores from './screens/scores.js'
import * as players from './screens/players.js'
import * as challenge from './screens/challenge.js'
import * as eventLive from './screens/event-live.js'
import * as leaderboard from './screens/leaderboard.js'
import * as course from './screens/course.js'
import * as adminHome from './screens/account.js'
import * as home from './screens/home.js'
import { startTab } from './home-today.js'
import * as teeTimes from './screens/tee-times.js'
import * as booking from './screens/booking.js'
import * as booked from './screens/booked.js'
import * as bookings from './screens/bookings.js'
import * as buddies from './screens/buddies.js'
import * as pins from './screens/pins.js'
import * as points from './screens/points.js'
import * as events from './screens/events.js'
import * as eventEditor from './screens/event-editor.js'
import * as eventBoardScreen from './screens/event-board.js'
import * as access from './screens/access.js'
import * as myGames from './screens/my-games.js'
import * as weather from './screens/weather.js'
import * as hutAdmin from './screens/hut-admin.js'
import * as friend from './screens/friend.js'
import { pendingFriend, setPendingFriend } from './screens/friend.js'
import { checkAlerts } from './alert-bar.js'

// Each screen exports an optional async load() and a sync draw(data).
const ADMIN = { home, account: adminHome, tee: teeTimes, book: booking, booked, mine: bookings, buddies, pins, points, events, event: eventEditor, evboard: eventBoardScreen, access, colours, weather, friend, hutadmin: hutAdmin, rules: bookingRules, comp: competitions, treq: teeRequests, mygames: myGames }
function screenFor() {
  if (S.tab === 'scores') return S.sview === 'players' ? players : S.sview === 'challenge' ? challenge : S.sview === 'pevent' ? eventLive : S.sview === 'counts' ? scoringRound : scores
  if (S.tab === 'lb') return leaderboard
  if (S.tab === 'course') return course
  return ADMIN[S.aview] || home
}

// Where the member has been, for the back arrows. A place is the screen state, with the parts that
// don't apply to a tab left out ('-'), so returning to a tab doesn't depend on stale sub-screens.
const place = () => (S.tab === 'home' ? { tab: 'home', aview: S.aview, sview: '-' } : { tab: S.tab, aview: '-', sview: S.tab === 'scores' ? S.sview : '-' })
const nav = navStack({ tab: 'home', aview: 'home', sview: '-' })
setDefaultBack(() => (nav.canGoBack() ? async () => {
  const p = nav.back()
  S.tab = p.tab
  if (p.aview !== '-') S.aview = p.aview
  if (p.sview !== '-') S.sview = p.sview
  S.gmodal = false
  await render()
  top0()
} : null))

// The round bar: Score · [Leaderboard] · Course on a round's screens. Leaderboard only when the card counts for a
// competition (S.roundBoard, worked out by the scorecard). Switching with it keeps Home underneath, so back = Home.
const ICONS = {
  score: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  lb: '<path d="M5 20V12M12 20V5M19 20v-7M3 20h18"/>',
  course: '<path d="M6 21V4l11 4-11 4"/>',
}
function roundTab() {
  const b = S.roundBoard
  if (S.tab === 'scores' && S.sview === 'card' && scores.getRound()?.id) return 'score'
  if (!S.roundBar) return null
  if (S.tab === 'course') return 'course'
  if (b && ((b.view === 'evboard' && S.tab === 'home' && S.aview === 'evboard' && S.evId === b.id) || (b.view === 'pevent' && S.tab === 'scores' && S.sview === 'pevent' && S.peId === b.id))) return 'lb'
  return null
}
function drawRoundBar() {
  const on = roundTab(), bar = $('roundbar')
  S.roundBar = !!on
  bar.hidden = !on
  $('app').classList.toggle('withbar', !!on)
  if (!on) return
  const tabs = [['score', 'Score'], ...(S.roundBoard ? [['lb', 'Leaderboard']] : []), ['course', 'Course']]
  bar.innerHTML = tabs.map(([k, n]) => `<button data-rt="${k}" aria-current="${k === on ? 'page' : 'false'}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>${n}</button>`).join('')
  bar.querySelectorAll('[data-rt]').forEach(b => (b.onclick = async () => {
    const k = b.dataset.rt, rb = S.roundBoard
    if (k === 'score') { S.tab = 'scores'; S.sview = 'card' }
    if (k === 'course') { S.tab = 'course'; S.hole = S.ch ?? 0 } // opens on the hole you're playing
    if (k === 'lb' && rb.view === 'pevent') { S.tab = 'scores'; S.sview = 'pevent'; S.peId = rb.id }
    if (k === 'lb' && rb.view === 'evboard') { S.tab = 'home'; S.aview = 'evboard'; S.evId = rb.id; S.evDay = 1 }
    S.roundBar = true
    nav.reset(place()) // back from any round tab goes Home
    await render()
    top0()
  }))
}

// When the app opens: Scores while you're mid-round (a hole saved on today's card, not finished),
// otherwise Home. Chosen once per visit; after that the tabs stay where you put them.
let startTabChosen = false
const chooseStartTab = async () => startTab(await api.getCurrentRound())

let seq = 0
async function render() {
  const mine = ++seq
  let screen, data
  try {
    // Signed out → sign-in screen. Signed in but not a member → explain. Otherwise the app.
    const session = await api.getSession()
    signedInAs = session?.user.id ?? null
    const me = session && (await api.getMe())
    if (mine !== seq) return
    $('app').classList.toggle('signed-out', !me)
    if (!session) screen = pendingFriend() && S.loginMode === 'welcome' ? friend : login // a friend link: show the card first
    else if (!me) screen = { draw: () => login.drawNotMember({ email: session.user.email }) }
    else {
      if (!startTabChosen) { startTabChosen = true; S.tab = await chooseStartTab(); if (S.tab === 'home') S.aview = 'home'; else S.sview = 'card'; nav.reset(place()) }
      if (pendingFriend()) { S.tab = 'home'; S.aview = 'friend' } // opened from a friend link (maybe before signing in)
      nav.visit(place())
      screen = screenFor()
    }
    data = screen.load ? await screen.load() : undefined
  } catch (err) {
    if (mine !== seq) return
    console.error(err)
    header('Something went wrong', '')
    $('main').innerHTML = `<div class="screen"><div class="empty-state">${esc(err.message || err)}</div></div>`
    return
  }
  if (mine !== seq) return // a newer render started while we were loading
  $('dateWrap').innerHTML = ''
  $('modal').innerHTML = ''
  $('app').classList.toggle('onhome', screen === home) // Home fills the screen, no scroll (a remote)
  screen.draw(data)
  drawRoundBar()
  if (screen === login || $('app').classList.contains('signed-out')) $('alerts').innerHTML = ''
  else checkAlerts(JSON.stringify(place()))
}
// Back to the app from another app or the lock screen: anything new?
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !$('app').classList.contains('signed-out')) checkAlerts(JSON.stringify(place()), true) })
setRender(render)

// Opened from a friend link (a QR scanned with the camera, or a link in a message): keep it until it's been
// seen signed in, and take it out of the address bar.
const takeFriendLink = () => {
  if (!location.hash.startsWith('#friend?')) return false
  setPendingFriend(location.hash)
  history.replaceState(null, '', location.pathname + location.search)
  return true
}
takeFriendLink()
addEventListener('hashchange', () => { if (takeFriendLink()) render() }) // a link opened while the app is already open

// Club colours: last-seen ones straight away (no flash), then the current ones from the club.
const seen = cachedTheme()
if (seen) applyTheme(seen)
api.getTheme().then(applyTheme).catch(err => console.warn('Club colours not loaded', err))

// Sign-out (here or in another tab) starts the app afresh.
// Supabase also announces SIGNED_IN whenever the tab regains focus. Only redraw for a real sign-in
// (a different login from the one on screen), so half-done things like an armed Delete button or
// text being typed aren't wiped when you switch back to the app.
let signedInAs = null
api.onAuthChange((event, session) => {
  if (event === 'SIGNED_OUT') location.replace(import.meta.env.BASE_URL)
  else if (event === 'SIGNED_IN' && session?.user.id !== signedInAs) render()
})
// A failed save or button action shouldn't fail silently.
addEventListener('unhandledrejection', e => { console.error(e.reason); toast(e.reason?.message || 'Something went wrong') })

render()
