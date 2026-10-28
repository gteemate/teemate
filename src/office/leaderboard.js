// Club office → Leaderboard: today's club competitions, live from the players' cards, and today's scores while the
// leaderboard of the day is on (the club's days, or switched for today here). Big enough for a clubhouse screen.
// Each part folds away: today's scores first, then today's competitions (open), then leagues (closed: for a nosey);
// what's open is remembered while the office is in use (S.oBoardOpen).
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, header, keepScroll, render, toast } from '../ui.js'
import { eventLastDay, isoDate, longDay, today } from '../dates.js'
import { matchDays, dayDate } from '../season.js'
import { dayBoardOn } from '../day-board.js'
import { loadBoard, boardHtml, bindLeague } from '../screens/event-board.js'
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

// A part of the page that folds away; open by default or as last left.
const part = (key, title, sub, openFirst, html) => `<details class="card oboard" data-ob="${key}" ${(S.oBoardOpen?.[key] ?? openFirst) ? 'open' : ''}>
  <summary><b>${title}</b><span class="hint">${sub}</span></summary>${html}</details>`

export function draw({ boards, dayOn, switched, field }) {
  header('Leaderboard', longDay(today()))
  $('main').innerHTML = `<div class="screen office">
    <div class="card olist"><div class="orow"><span class="ot"><b>Leaderboard of the day</b><span>${dayOn ? 'On today: members see everyone’s scores' : 'Off today: members see only competitions'}${switched ? ' (switched for today)' : ''}</span></span>
      <span class="seg" role="group" aria-label="Leaderboard of the day today"><button data-o-db="on" aria-pressed="${dayOn}">On</button><button data-o-db="off" aria-pressed="${!dayOn}">Off</button></span></div></div>
    ${field ? part('today', 'Today’s scores', 'Everyone’s round today', true, fieldHtml(field)) : ''}
    ${[...boards].sort((a, b) => (a.e.style === 'league') - (b.e.style === 'league')).map(b =>
      part(`e:${b.e.id}`, esc(b.e.name), b.e.style === 'league' ? 'League · this week' : 'On today', b.e.style !== 'league', boardHtml(b))).join('')
      || (field ? '' : '<div class="hint">No club competition today.</div>')}
  </div>`
  bindField()
  bindLeague() // a league's weeks and views
  document.querySelectorAll('details[data-ob]').forEach(d => d.addEventListener('toggle', () => { S.oBoardOpen = { ...S.oBoardOpen, [d.dataset.ob]: d.open } }))
  document.querySelectorAll('[data-o-db]').forEach(b => (b.onclick = async () => {
    const on = b.dataset.oDb === 'on'
    try { await api.setDayBoardToday(on) } catch (err) { toast(err.message); return }
    await keepScroll(render); toast(on ? 'Today’s scores are on for today' : 'Today’s scores are off for today')
  }))
}
