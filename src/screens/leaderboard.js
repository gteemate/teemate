// Leaderboard tab: today's field (gross, net, Stableford, birdies), or an event that's on today
// (club events for everyone; other events for the players in them).
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, header, keepScroll, top0, render } from '../ui.js'
import { courseHandicap, roundSummary, toPar } from '../scoring.js'
import { teeRating } from '../games.js'
import { longDay, today, isoDate, addDaysIso } from '../dates.js'
import { loadBoard, boardHtml, bindBoard } from './event-board.js'

export async function load() {
  const [all, me] = await Promise.all([api.getEvents(), api.getMe()])
  const t = isoDate(today())
  // Events on today that are for me to see here: club events, or ones I'm in or set up.
  const events = all.filter(e => e.startDate <= t && addDaysIso(e.startDate, e.days - 1) >= t && (e.club || e.players.includes(me.id) || e.createdBy?.id === me.id))
  if (S.lbv === 'event') S.lbv = events[0]?.id ?? 'today' // first visit: show the event if there is one
  const ev = events.find(e => e.id === S.lbv)
  if (ev) return { events, board: await loadBoard(ev.id) }
  S.lbv = 'today'
  const [course, rounds] = await Promise.all([api.getCourse(), api.getTodayRounds(today())])
  return { events, course, rounds, me }
}

export function draw(data) {
  if (data.board?.e) {
    header(esc(data.board.e.name), `${data.board.e.players.length} players`)
    $('main').innerHTML = boardHtml(data.board, lbSeg(data.events))
    bindBoard()
    bindLbSeg()
  } else todayBoard(data)
}

export function lbSeg(events) {
  if (!events.length) return ''
  const opts = [['today', 'Today'], ...events.map(e => [e.id, esc(e.name)])]
  return opts.length === 2
    ? `<div class="seg" role="group">${opts.map(([k, n]) => `<button data-lv="${k}" aria-pressed="${String(S.lbv) === String(k)}">${n}</button>`).join('')}</div>`
    : `<div class="tabs-pill" role="group">${opts.map(([k, n]) => `<button data-lv="${k}" aria-pressed="${String(S.lbv) === String(k)}">${n}</button>`).join('')}</div>`
}
export function bindLbSeg() {
  document.querySelectorAll('[data-lv]').forEach(b => (b.onclick = async () => { S.lbv = b.dataset.lv === 'today' ? 'today' : +b.dataset.lv; S.evDay = null; await render(); top0() }))
}

function todayBoard({ events, course, rounds, me }) {
  const m = S.lbm
  header('Leaderboard', `${esc(course.name)} · ${longDay(today())} · White tees`)
  const rows = rounds.map(r => ({ ...r, ...roundSummary(course.holes, r.gross, courseHandicap(r.member.hcp, teeRating(course))), ch: courseHandicap(r.member.hcp, teeRating(course)) }))
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
  $('main').innerHTML = `<div class="screen">${lbSeg(events)}
    <div class="tabs-pill" role="group" aria-label="Leaderboard type">${[['gross', 'Gross'], ['net', 'Net'], ['stab', 'Stableford'], ['birdies', 'Birdies']].map(([k, l]) => `<button data-m="${k}" aria-pressed="${m === k}">${l}</button>`).join('')}</div>
    <div class="hint">${note}</div>
    <div class="lblist">${html}</div>
  </div>`
  document.querySelectorAll('[data-m]').forEach(b => (b.onclick = () => { S.lbm = b.dataset.m; keepScroll(render) }))
  bindLbSeg()
}
