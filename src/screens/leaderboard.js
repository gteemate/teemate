// Leaderboard tab: today's field (gross, net, Stableford, birdies), or an event that's on or coming up
// (all-member events for everyone; other events for the players in them).
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, header, keepScroll, top0, render, redraw } from '../ui.js'
import { courseHandicap, roundSummary, toPar } from '../scoring.js'
import { teeRating } from '../games.js'
import { longDay, today, isoDate, eventLastDay, fromIso } from '../dates.js'
import { loadBoard, boardHtml, bindBoard } from './event-board.js'
import { dayBoardOn } from '../day-board.js'

export async function load() {
  const [all, me] = await Promise.all([api.getEvents(), api.getMe()])
  const t = isoDate(today())
  // Events on now or coming up that are for me to see: all-member events, or ones I'm in (or set up myself).
  const events = all.filter(e => eventLastDay(e) >= t && (e.everyone || e.players.includes(me.id) || (!e.club && e.createdBy?.id === me.id)))
    .sort((a, b) => (a.startDate > t) - (b.startDate > t) || (a.startDate < b.startDate ? -1 : 1)) // on now first, then by date
  // The leaderboard of the day can be off (the club's days, or today's switch): then only competitions show.
  const dayOn = dayBoardOn(await api.getTheme(), t)
  if (S.lbv === 'event' || (!dayOn && S.lbv === 'today')) S.lbv = events[0]?.id ?? 'today' // first visit: show the event if there is one
  const ev = events.find(e => e.id === S.lbv)
  if (ev) return { events, dayOn, board: await loadBoard(ev.id) }
  if (!dayOn) return { events, dayOn, off: true }
  S.lbv = 'today'
  const [course, rounds] = await Promise.all([api.getCourse(), api.getTodayRounds(today())])
  return { events, course, rounds, me }
}

export function draw(data) {
  if (data.off) { // the leaderboard of the day is off, and no competition is on
    header('Leaderboard', longDay(today()))
    $('main').innerHTML = '<div class="screen"><div class="empty-state">Today’s scores aren’t shown today. Competitions show here when they’re on.</div></div>'
    return
  }
  if (data.board?.e) {
    header(esc(data.board.e.name), `${data.board.e.players.length} player${data.board.e.players.length === 1 ? '' : 's'}`)
    $('main').innerHTML = boardHtml(data.board, lbSeg(data.events, data.dayOn))
    bindBoard(data.board)
    bindLbSeg()
  } else todayBoard(data)
}

export function lbSeg(events, dayOn = true) {
  if (!events.length || (!dayOn && events.length < 2)) return ''
  const t = isoDate(today())
  const opts = [...(dayOn ? [['today', 'Today']] : []), ...events.map(e => [e.id, esc(e.name) + (e.startDate > t ? ` · ${longDay(fromIso(e.startDate)).split(' ').slice(0, 2).join(' ')}` : '')])]
  return opts.length === 2
    ? `<div class="seg" role="group">${opts.map(([k, n]) => `<button data-lv="${k}" aria-pressed="${String(S.lbv) === String(k)}">${n}</button>`).join('')}</div>`
    : `<div class="tabs-pill" role="group">${opts.map(([k, n]) => `<button data-lv="${k}" aria-pressed="${String(S.lbv) === String(k)}">${n}</button>`).join('')}</div>`
}
export function bindLbSeg() {
  document.querySelectorAll('[data-lv]').forEach(b => (b.onclick = async () => { S.lbv = b.dataset.lv === 'today' ? 'today' : +b.dataset.lv; S.evDay = null; await render(); top0() }))
}

function todayBoard({ events, course, rounds, me }) {
  header('Leaderboard', `${esc(course.name)} · ${longDay(today())} · White tees`)
  $('main').innerHTML = `<div class="screen">${lbSeg(events, true)}${fieldHtml({ course, rounds, me })}</div>`
  bindField()
  bindLbSeg()
}

/** Today's scores (gross, net, Stableford, birdies): the members' Leaderboard tab and the club office. */
export function fieldHtml({ course, rounds, me }) {
  const m = S.lbm
  const rows = rounds.map(r => ({ ...r, ...roundSummary(r.holes ? r.holes.map(i => course.holes[i]) : course.holes, r.gross, courseHandicap(r.member.hcp, teeRating(course))), ch: courseHandicap(r.member.hcp, teeRating(course)) }))
  const played = rows.filter(r => r.thru), waiting = rows.filter(r => !r.thru)
  const key = { gross: r => r.g, net: r => r.n, stab: r => -r.pts, birdies: r => -r.bd }[m]
  played.sort((a, b) => key(a) - key(b) || (m === 'birdies' ? a.g - b.g : 0) || b.thru - a.thru)
  const val = r => (m === 'gross' ? toPar(r.g) : m === 'net' ? toPar(r.n) : m === 'stab' ? r.pts : r.bd)
  const sub = r => `${r.thru === 18 ? 'Finished' : `thru ${r.thru}`} · ${m === 'net' || m === 'stab' ? `CH ${r.ch} · gross ${toPar(r.g)}` : m === 'birdies' ? `gross ${toPar(r.g)}${r.eag ? ` · ${r.eag} eagle` : ''}` : `net ${toPar(r.n)}`}`
  let pos = 0, prev = null
  const isMe = r => r.member.id === me.id
  const html = played.map((r, i) => {
    const v = key(r)
    if (v !== prev) { pos = i + 1; prev = v }
    const tie = played.filter(x => key(x) === v).length > 1
    const neg = (m === 'gross' && r.g < 0) || (m === 'net' && r.n < 0)
    return `<div class="lbrow${isMe(r) ? ' me' : ''}"><span class="lpos">${tie ? 'T' : ''}${pos}</span><span class="av">${ini(r.member.name)}</span><span class="who"><strong>${esc(r.member.name)}${isMe(r) ? ' (you)' : ''}${r.member.guest ? ' <span class="pill tag">Guest</span>' : ''}</strong><small>${sub(r)}${r.live && r.thru < 18 ? ' <span class="livedot">● live</span>' : ''}</small></span><span class="lval${neg ? ' under' : ''}">${val(r)}</span></div>`
  }).join('') + waiting.map(r => `<div class="lbrow wait"><span class="lpos">–</span><span class="av">${ini(r.member.name)}</span><span class="who"><strong>${esc(r.member.name)}</strong><small>yet to play${r.teeTime ? ` · tees ${r.teeTime}` : ''}</small></span><span class="lval">–</span></div>`).join('')
  const note = { gross: 'Strokes to par, no handicap.', net: 'Strokes to par after full course-handicap shots.', stab: 'Stableford points with full course-handicap shots.', birdies: "Gross birdies or better on today's round." }[m]
  return `<div class="tabs-pill" role="group" aria-label="Leaderboard type">${[['gross', 'Gross'], ['net', 'Net'], ['stab', 'Stableford'], ['birdies', 'Birdies']].map(([k, l]) => `<button data-m="${k}" aria-pressed="${m === k}">${l}</button>`).join('')}</div>
    <div class="hint">${note}</div>
    <div class="lblist">${html}</div>
`
}
export function bindField() {
  document.querySelectorAll('[data-m]').forEach(b => (b.onclick = () => { S.lbm = b.dataset.m; keepScroll(redraw) }))
}
