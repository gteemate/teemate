// Club office → Leaderboard: today's club competitions, live from the players' cards, and today's scores while the
// leaderboard of the day is on (the club's days, or switched for today here). Big enough for a clubhouse screen.
import * as api from '../api.js'
import { $, esc, header, keepScroll, render, toast } from '../ui.js'
import { eventLastDay, isoDate, longDay, today } from '../dates.js'
import { matchDays, dayDate } from '../season.js'
import { dayBoardOn } from '../day-board.js'
import { loadBoard, boardHtml } from '../screens/event-board.js'
import { fieldHtml, bindField } from '../screens/leaderboard.js'
import { clubEvent } from './shell.js'

export async function load() {
  const t = isoDate(today())
  const [events, theme, me] = await Promise.all([api.getEvents(), api.getTheme(), api.getMe()])
  // Club competitions on today (a season only on its match days).
  const on = events.filter(e => clubEvent(e) && e.startDate <= t && eventLastDay(e) >= t && (!e.season || matchDays(e).some(d => dayDate(e, d) === t)))
  const boards = await Promise.all(on.map(e => loadBoard(e.id)))
  const dayOn = dayBoardOn(theme, t), switched = theme?.dayBoardToday?.date === t
  const field = dayOn ? { course: await api.getCourse(), rounds: await api.getTodayRounds(today()), me } : null
  return { boards, dayOn, switched, field }
}

export function draw({ boards, dayOn, switched, field }) {
  header('Leaderboard', longDay(today()))
  $('main').innerHTML = `<div class="screen office">
    <div class="card olist"><div class="orow"><span class="ot"><b>Leaderboard of the day</b><span>${dayOn ? 'On today: members see everyone’s scores' : 'Off today: members see only competitions'}${switched ? ' (switched for today)' : ''}</span></span>
      <span class="seg" role="group" aria-label="Leaderboard of the day today"><button data-o-db="on" aria-pressed="${dayOn}">On</button><button data-o-db="off" aria-pressed="${!dayOn}">Off</button></span></div></div>
    ${boards.map(b => `<h3>${esc(b.e.name)}</h3><div class="card oboard">${boardHtml(b)}</div>`).join('') || '<div class="hint">No club competition today.</div>'}
    ${field ? `<h3>Today’s scores</h3><div class="card oboard">${fieldHtml(field)}</div>` : ''}
  </div>`
  bindField()
  document.querySelectorAll('[data-o-db]').forEach(b => (b.onclick = async () => {
    const on = b.dataset.oDb === 'on'
    try { await api.setDayBoardToday(on) } catch (err) { toast(err.message); return }
    await keepScroll(render); toast(on ? 'Today’s scores are on for today' : 'Today’s scores are off for today')
  }))
}
