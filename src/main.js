import './styles.css'
import { S } from './state.js'
import * as api from './api.js'
import { $, esc, header, setRender, toast, top0 } from './ui.js'
import * as login from './screens/login.js'
import * as scores from './screens/scores.js'
import * as players from './screens/players.js'
import * as leaderboard from './screens/leaderboard.js'
import * as course from './screens/course.js'
import * as adminHome from './screens/admin-home.js'
import * as teeTimes from './screens/tee-times.js'
import * as booking from './screens/booking.js'
import * as booked from './screens/booked.js'
import * as bookings from './screens/bookings.js'
import * as buddies from './screens/buddies.js'
import * as pins from './screens/pins.js'
import * as games from './screens/games.js'
import * as points from './screens/points.js'
import * as events from './screens/events.js'
import * as eventEditor from './screens/event-editor.js'
import * as access from './screens/access.js'

// Each screen exports an optional async load() and a sync draw(data).
const ADMIN = { home: adminHome, tee: teeTimes, book: booking, booked, mine: bookings, buddies, pins, games, points, events, event: eventEditor, access }
function screenFor() {
  if (S.tab === 'scores') return S.sview === 'players' ? players : scores
  if (S.tab === 'lb') return leaderboard
  if (S.tab === 'course') return course
  return ADMIN[S.aview] || adminHome
}

let seq = 0
async function render() {
  const mine = ++seq
  document.querySelectorAll('nav.tabs button').forEach(b => b.setAttribute('aria-current', b.dataset.tab === S.tab ? 'page' : 'false'))
  let screen, data
  try {
    // Signed out → sign-in screen. Signed in but not a member → explain. Otherwise the app.
    const session = await api.getSession()
    const me = session && (await api.getMe())
    if (mine !== seq) return
    $('app').classList.toggle('signed-out', !me)
    if (!session) screen = login
    else if (!me) screen = { draw: () => login.drawNotMember({ email: session.user.email }) }
    else screen = screenFor()
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
  screen.draw(data)
}
setRender(render)

// Sign-out (here or in another tab) starts the app afresh.
api.onAuthChange(event => {
  if (event === 'SIGNED_OUT') location.replace(import.meta.env.BASE_URL)
  else if (event === 'SIGNED_IN') render()
})
// A failed save or button action shouldn't fail silently.
addEventListener('unhandledrejection', e => { console.error(e.reason); toast(e.reason?.message || 'Something went wrong') })

document.querySelectorAll('nav.tabs button').forEach(b => (b.onclick = async () => {
  const t = b.dataset.tab
  if (t === 'scores' && S.tab === 'scores') S.sview = 'card' // tapping Scores again leaves the player picker
  if (t === 'admin') S.aview = 'home'
  S.tab = t
  S.gmodal = false
  await render()
  top0()
}))
render()
