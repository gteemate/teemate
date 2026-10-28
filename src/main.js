import './styles.css'
import { S } from './state.js'
import * as api from './api.js'
import { $, esc, header, setRender, setRedraw, setDefaultBack, toast, top0, keepScroll } from './ui.js'
import { navStack } from './nav-stack.js'
import * as login from './screens/login.js'
import * as competitions from './screens/competitions.js'
import * as scoringRound from './screens/scoring-round.js'
import { applyTheme, cachedTheme } from './theme.js'
import * as scores from './screens/scores.js'
import * as paperFlow from './paper/paper-flow.js'
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
import * as points from './screens/points.js'
import * as events from './screens/events.js'
import * as eventEditor from './screens/event-editor.js'
import * as eventBoardScreen from './screens/event-board.js'
import * as hutOrder from './screens/hut-order.js'
import * as matchScreen from './screens/match.js'
import * as knockout from './screens/knockout.js'
import * as koCard from './screens/ko-card.js'
import * as friend from './screens/friend.js'
import { pendingFriend, setPendingFriend } from './screens/friend.js'
import { checkAlerts } from './alert-bar.js'
import { openRoundLb } from './round-lb.js'
import { drawSide, hideSide, forgetSummary, summary } from './office/shell.js'

// Screens most members never open (admin pages, the club office) load the first time they're needed, so the
// first download is smaller on a weak signal. Each acts like the screen itself: load() fetches it, then draw().
const lazies = []
const lazy = get => {
  let mod
  const fetch = async () => (mod ??= await get().catch(newVersion))
  const screen = { async load(...a) { await fetch(); return mod.load?.(...a) }, draw: d => mod.draw(d), fetch }
  lazies.push(screen)
  return screen
}
// A screen file from an older version of the app (the phone showed its kept copy, and the app has been updated since):
// reload once to get the new version, rather than a screen that won't open.
function newVersion(err) {
  try { if (!sessionStorage.getItem('tm-reloaded')) { sessionStorage.setItem('tm-reloaded', '1'); location.reload() } } catch { /* no storage */ }
  throw err
}
// On a decent connection, fetch the on-demand screens quietly once the app has settled, so they're on the phone
// (and work offline) by the time they're opened. Not on a slow or data-saving connection.
if (import.meta.env.PROD) setTimeout(() => {
  const c = navigator.connection
  if (navigator.onLine !== false && !c?.saveData && !/(^|-)2g$/.test(c?.effectiveType ?? '')) fetchAllScreens().catch(() => {})
}, 10000)
/** Fetch every screen that loads on demand now (the tests; or to warm them up when the signal is good). */
export const fetchAllScreens = () => Promise.all(lazies.map(l => l.fetch()))
const colours = lazy(() => import('./screens/colours.js'))
const bookingRules = lazy(() => import('./screens/booking-rules.js'))
const teeRequests = lazy(() => import('./screens/tee-requests.js'))
const pins = lazy(() => import('./screens/pins.js'))
const access = lazy(() => import('./screens/access.js'))
const hutAdmin = lazy(() => import('./screens/hut-admin.js'))
const hutStaff = lazy(() => import('./screens/hut-staff.js'))
const signupsAdmin = lazy(() => import('./screens/signups-admin.js'))
const koNew = lazy(() => import('./screens/ko-new.js'))
const myGames = lazy(() => import('./screens/my-games.js'))
const weather = lazy(() => import('./screens/weather.js'))
const findTime = lazy(() => import('./screens/find-time.js'))
const officeToday = lazy(() => import('./office/today.js'))
const officeMembers = lazy(() => import('./office/members.js'))
const officeTee = lazy(() => import('./office/tee.js'))
const officeComps = lazy(() => import('./office/comps.js'))
const officeClub = lazy(() => import('./office/club.js'))
const officeBoard = lazy(() => import('./office/leaderboard.js'))
const officeGuests = lazy(() => import('./office/guests.js'))

// Each screen exports an optional async load() and a sync draw(data).
const ADMIN = { home, account: adminHome, tee: teeTimes, book: booking, booked, mine: bookings, buddies, pins, points, events, event: eventEditor, evboard: eventBoardScreen, access, colours, weather, friend, hutadmin: hutAdmin, hutorder: hutOrder, hutstaff: hutStaff, match: matchScreen, signups: signupsAdmin, ko: knockout, konew: koNew, kocard: koCard, rules: bookingRules, comp: competitions, treq: teeRequests, mygames: myGames , findtime: findTime}
// The club office: a section page, or one of the admin pages it opens (pins, a competition…). Pages that go back
// to Account, Home, Club events or Competitions go back to the office section instead.
const OFFICE = { today: officeToday, members: officeMembers, tee: officeTee, board: officeBoard, comps: officeComps, club: officeClub, guests: officeGuests }
const OFFICE_HOME = new Set(['office', 'account', 'home', 'events', 'comp'])
const officeScreen = () => (OFFICE_HOME.has(S.aview) || !ADMIN[S.aview] ? OFFICE[S.ov] ?? officeToday : ADMIN[S.aview])
function screenFor() {
  if (S.office) return officeScreen()
  if (S.tab === 'scores') return S.sview === 'players' ? players : S.sview === 'challenge' ? challenge : S.sview === 'pevent' ? eventLive : S.sview === 'counts' ? scoringRound : S.sview === 'paper' ? paperFlow : scores
  if (S.tab === 'lb') return leaderboard
  if (S.tab === 'course') return course
  return ADMIN[S.aview] || home
}

// Where the member has been, for the back arrows. A place is the screen state, with the parts that
// don't apply to a tab left out ('-'), so returning to a tab doesn't depend on stale sub-screens.
const place = () => (S.office ? { tab: 'home', aview: OFFICE_HOME.has(S.aview) ? `office:${S.ov}` : S.aview, sview: '-' }
  : S.tab === 'home' ? { tab: 'home', aview: S.aview, sview: '-' } : { tab: S.tab, aview: '-', sview: S.tab === 'scores' ? S.sview : '-' })
const nav = navStack({ tab: 'home', aview: 'home', sview: '-' }, { passing: p => p.aview === 'booked' }) // Booked: passed through
setDefaultBack(() => (nav.canGoBack() && !(S.office && OFFICE_HOME.has(S.aview)) ? async () => { // office sections: the sidebar, no back
  const p = nav.back()
  S.tab = p.tab
  if (p.aview.startsWith('office:')) { S.aview = 'office'; S.ov = p.aview.slice(7) } else if (p.aview !== '-') S.aview = p.aview
  if (p.sview !== '-') S.sview = p.sview
  S.gmodal = false
  await render()
  top0()
} : null))

// The round bar: Score · [Leaderboard] · Course on a round's screens. Leaderboard only when the card counts for a
// competition (S.roundBoard, worked out by the scorecard) or today's scores are on (round-lb.js). Switching with it keeps
// Home underneath, so back = Home.
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
  if (S.tab === 'lb' && (b || S.roundDayOn)) return 'lb' // today's scores
  if (b && ((b.view === 'evboard' && S.tab === 'home' && S.aview === 'evboard' && S.evId === b.id) || (b.view === 'pevent' && S.tab === 'scores' && S.sview === 'pevent' && S.peId === b.id))) return 'lb'
  return null
}
function drawRoundBar() {
  const on = roundTab(), bar = $('roundbar')
  S.roundBar = !!on
  bar.hidden = !on
  $('app').classList.toggle('withbar', !!on)
  if (!on) return
  const tabs = [['score', 'Score'], ...(S.roundBoard || S.roundDayOn ? [['lb', 'Leaderboard']] : []), ['course', 'Course']]
  bar.innerHTML = tabs.map(([k, n]) => `<button data-rt="${k}" aria-current="${k === on ? 'page' : 'false'}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>${n}</button>`).join('')
  bar.querySelectorAll('[data-rt]').forEach(b => (b.onclick = async () => {
    const k = b.dataset.rt, rb = S.roundBoard
    if (k === 'score') { S.tab = 'scores'; S.sview = 'card' }
    if (k === 'course') { S.tab = 'course'; S.hole = S.ch ?? 0 } // opens on the hole you're playing
    if (k === 'lb') openRoundLb(rb ? 'comp' : 'today') // the card's competition first; a general round, today's scores
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
// Data kept on the device: ask (at most every 30 s, or now when forced) whether anyone changed any of it, and draw
// the screen again if it used a kind that changed.
let stampsKnown = false, lastReads = new Set(), lastScreen = null, lastData
setRedraw(() => (lastScreen ? lastScreen.draw(lastData) : render()))
function checkForChanges(force = false) {
  if (!signedInAs) return
  const at = seq
  api.cache.check(force).then(kinds => {
    // Not over an open pop-up or half-typed form: the changed data is fetched fresh on the next screen anyway.
    const busy = $('modal').innerHTML.trim() || document.activeElement?.matches?.('input, textarea, select')
    if (at === seq && !busy && kinds.some(k => lastReads.has(k))) keepScroll(render)
  })
}

async function render() {
  const mine = ++seq
  let screen, data
  try {
    // Signed out → sign-in screen. Signed in but not a member → explain. Otherwise the app.
    const session = await api.getSession()
    signedInAs = session?.user.id ?? null
    api.cache.setUser(signedInAs) // data kept on this device belongs to whoever is signed in
    if (signedInAs && !stampsKnown) { stampsKnown = true; await api.cache.check(true) } // what's changed since last time
    const me = session && (await api.getMe())
    if (mine !== seq) return
    $('app').classList.toggle('signed-out', !me)
    if (!session) screen = pendingFriend() && S.loginMode === 'welcome' ? friend : login // a friend link: show the card first
    else if (!me) screen = { draw: () => login.drawNotMember({ email: session.user.email }) }
    else if (me.office || S.office) {
      // The club office: the office login only ever sees this; an admin member is here until Back to TeeMate.
      if (!me.admin) S.office = false
      else {
        S.office = true; S.tab = 'home'; startTabChosen = true
        if (S.navReset) { S.navReset = false; nav.reset(place()) } else nav.visit(place())
        screen = screenFor()
      }
    }
    if (me && !screen) {
      if (!startTabChosen) { startTabChosen = true; S.tab = await chooseStartTab(); if (S.tab === 'home') S.aview = 'home'; else S.sview = 'card'; nav.reset(place()) }
      if (pendingFriend()) { S.tab = 'home'; S.aview = 'friend' } // opened from a friend link (maybe before signing in)
      if ((S.matchPick || S.matchHold) && !(S.tab === 'home' && ['tee', 'book'].includes(S.aview))) Object.assign(S, { matchPick: null, matchHold: null, matchPart: null }) // left Book this match
      if (S.matchMove && !(S.tab === 'home' && S.aview === 'tee')) S.matchMove = null // left Rearrange
      if (S.navReset) { S.navReset = false; nav.reset(place()) } else nav.visit(place()) // a finished booking starts afresh from Home
      screen = screenFor()
    }
    if (S.office) forgetSummary() // what's waiting: fresh on every page
    api.cache.resetReads()
    ;[data] = await Promise.all([screen.load ? screen.load() : undefined, S.office ? summary() : null])
    lastReads = new Set(api.cache.reads())
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
  $('app').classList.toggle('office', !!S.office && !$('app').classList.contains('signed-out'))
  lastScreen = screen; lastData = data
  $('app').classList.remove('kiosk') // Guests sets it again while the iPad is with a member
  screen.draw(data)
  if (S.office && !$('app').classList.contains('signed-out')) {
    const me = await api.getMe(), [s, theme] = await Promise.all([summary(), api.getTheme().catch(() => null)])
    if (mine !== seq) return
    drawSide(s, me, theme?.name)
    $('roundbar').hidden = true
    $('alerts').innerHTML = ''
    checkForChanges()
    return
  }
  hideSide()
  drawRoundBar()
  checkForChanges()
  if (screen === login || $('app').classList.contains('signed-out')) $('alerts').innerHTML = ''
  else checkAlerts(JSON.stringify(place()))
}
// Back to the app from another app or the lock screen: anything new?
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || $('app').classList.contains('signed-out')) return
  checkAlerts(JSON.stringify(place()), true)
  checkForChanges(true)
})
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

// Keep the app and its pictures on the device (public/sw.js); not while developing, so changes show at once.
if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
