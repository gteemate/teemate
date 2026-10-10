// Book tee times: pick a day and a time with space. Days not released yet show when they open, with a
// countdown in the last 24 hours (the database refuses early bookings; admins can book ahead).
import * as api from '../api.js'
import { S } from '../state.js'
import { $, header, top0, render, toast } from '../ui.js'
import { DN, isoDate, nextDays, longDay, hhmm, today, addDaysIso, fromIso } from '../dates.js'
import { opensAt, openLabel, countdown } from '../release.js'

export async function load() {
  const rules = await api.getBookingRules()
  const days = nextDays(rules.days + 1) // today up to the furthest day that opens next
  S.day = Math.min(S.day, days.length - 1)
  let req = null
  if (S.reqMode) { // Request a tee time: any day not open yet, up to 12 months ahead
    let min = isoDate(today())
    while (opensAt(min, rules) == null || opensAt(min, rules) <= rules.now) min = addDaysIso(min, 1)
    if (!S.reqDate || S.reqDate < min) S.reqDate = min
    req = { date: S.reqDate, min, max: addDaysIso(isoDate(today()), 366) }
  }
  const [sheet, points, me] = await Promise.all([api.getTeeSheet(req ? req.date : isoDate(days[S.day])), api.getGuestPoints(), api.getMe()])
  return { days, sheet, points, me, rules, req, skew: rules.now - Date.now() } // skew: the club's clock minus this phone's
}

let tick // the countdown timer, one per visit to this screen
const DAY = 864e5

// Tee times have to be at least 2 hours apart (the database checks this too, for everyone booked).
const GAP = 120

export function draw({ days, sheet, points, me, rules, req, skew }) {
  clearInterval(tick)
  const iso = req ? req.date : isoDate(days[S.day]), at = opensAt(iso, rules), now = () => Date.now() + skew
  const closed = !req && at && at > now(), locked = closed && !me.admin // admins can book ahead; requests pick any time
  const mine = sheet.filter(s => s.players.some(p => p.memberId === me.id))
  const isMine = s => mine.includes(s)
  const tooClose = s => !isMine(s) && mine.find(m => Math.abs(m.time - s.time) < GAP)
  const free = s => s.capacity - s.players.length
  header(req ? 'Request a tee time' : 'Book tee times', `${longDay(req ? fromIso(req.date) : days[S.day])} · <b>${sheet.filter(s => free(s) > 0).length}</b> of ${sheet.length} available`)
  if (req) $('dateWrap').innerHTML = `<div class="reqdate"><label for="rq-date">Day</label><input type="date" id="rq-date" class="plainsel" min="${req.min}" max="${req.max}" value="${req.date}">
    <span class="hint">Any day not open for booking yet. Pick a time, then say why you need it; an admin approves or declines.</span></div>`
  else $('dateWrap').innerHTML = `<div class="dates" role="group" aria-label="Choose day">${days.map((d, i) => `<button class="day" data-d="${i}" aria-pressed="${i === S.day}"><small>${i === 0 ? 'Today' : DN[d.getDay()]}</small><b>${d.getDate()}</b></button>`).join('')}</div>`
  const mv = S.matchMove // Rearrange a match: pick its new time
  const need = mv ? mv.size : S.matchPick ? 1 + S.matchPick.length : 0 // Book this match / Rearrange: only times with room for everyone in it
  const list = sheet.filter(s => (need ? free(s) >= need : S.filter === 'all' || (S.filter === 'open' && free(s) > 0) || (S.filter === '2' && free(s) >= 2)))
  const left = points.allowance - points.mine.reduce((t, x) => t + x.points, 0)
  const until = () => (at - now() < DAY ? countdown(at - now()) : 'You can see the times, but not book them yet.')
  const banner = closed ? `<div class="relbanner"><b>${openLabel(iso, rules)}</b><span id="relcd">${me.admin ? 'Not open to members yet. You can book it as an admin.' : until()}</span>${me.admin ? '' : '<button class="linkbtn" id="rq-day">Request a time on this day</button>'}</div>` : ''
  let h = `<div class="screen">${banner}${need ? `<div class="hcpnote">${mv ? `Moving your match from ${hhmm(mv.from)}: pick a new time.` : 'Booking your match:'} Showing tee times with room for all ${need}.</div>` : ''}<div class="ptsmini${left < points.cost ? ' low' : ''}">🎟️ <b>${left}</b> of ${points.allowance} guest points left · ${points.cost} per guest${left < points.cost ? ' · not enough for a guest' : ''}</div>${need ? '' : `<div class="filters" role="group" aria-label="Filter">${[['all', 'All'], ['open', 'Has space'], ['2', '2+ spaces']].map(([k, l]) => `<button class="chip" data-f="${k}" aria-pressed="${S.filter === k}">${l}</button>`).join('')}</div>`}`
  for (const [g, a, b] of [['Morning', 0, 720], ['Afternoon', 720, 900], ['Twilight', 900, 1440]]) {
    const gs = list.filter(s => s.time >= a && s.time < b)
    if (!gs.length) continue
    h += `<div class="period">${g}${g === 'Afternoon' ? " · 12:20–13:00 held for Ladies' Comp" : ''}</div>`
    gs.forEach(s => {
      const f = free(s), near = mv ? null : tooClose(s), off = !f || near || isMine(s), taken = s.players.length
      const what = isMine(s) ? 'You’re booked on this' : near ? `Within 2 hours of your ${hhmm(near.time)}` : !f ? 'Fully booked' : f === 4 ? 'Open tee' : `${f} space${f > 1 ? 's' : ''} left`
      h += `<button class="slot${off ? ' full' : ''}${locked ? ' notyet' : ''}${isMine(s) ? ' minebk' : ''}" data-id="${s.id}" ${off ? 'aria-disabled="true"' : ''}><span class="time">${hhmm(s.time)}</span>
        <span class="meta"><strong>${what}${s.twilight ? '<span class="pill tag">Twilight</span>' : ''}</strong>1st tee · 18 holes</span>
        <span class="balls" aria-label="${taken} of ${s.capacity} booked">${[0, 1, 2, 3].map(k => `<span class="ball${k < taken ? ' taken' : ''}"></span>`).join('')}</span></button>`
    })
  }
  $('main').innerHTML = h + '</div>'
  if ($('rq-date')) $('rq-date').onchange = async e => { if (e.target.value) { S.reqDate = e.target.value; await render(); top0() } }
  if ($('rq-day')) $('rq-day').onclick = async () => { S.reqMode = true; S.reqDate = iso; await render(); top0() }
  document.querySelector('.day[aria-pressed="true"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' }) // 9+ days don't all fit
  document.querySelectorAll('.day').forEach(b => (b.onclick = async () => { S.day = +b.dataset.d; await render(); top0() }))
  document.querySelectorAll('.chip').forEach(b => (b.onclick = () => { S.filter = b.dataset.f; render() }))
  document.querySelectorAll('.slot').forEach(b => (b.onclick = async () => {
    const s = sheet.find(x => x.id === +b.dataset.id)
    if (locked) { toast(`${openLabel(iso, rules)}`); return }
    if (isMine(s)) { Object.assign(S, { aview: 'mine' }); await render(); top0(); return } // see it in Bookings
    if (mv) return moveSheet(s, mv) // the old time goes when the new one is booked, so the 2-hour gap doesn't apply here
    const near = tooClose(s)
    if (near) { toast(`You’re booked at ${hhmm(near.time)}. Tee times have to be at least 2 hours apart`); return }
    if (!free(s)) { toast('That time is full'); return }
    Object.assign(S, { slotId: s.id, picked: S.matchPick ?? [], guests: [], aview: 'book', matchPick: null }) // Book this match: the other three already added
    await render()
    top0()
  }))
  // Count down to the release; when it comes, redraw and the day is open.
  if (locked) tick = setInterval(() => {
    const el = $('relcd')
    if (!el) { clearInterval(tick); return } // left this screen
    if (at - now() <= 0) { clearInterval(tick); render(); return }
    el.textContent = until()
  }, 1000)
}

// Rearrange a match: confirm the new time; the booking moves in one step (the old time is freed).
function moveSheet(s, mv) {
  $('modal').innerHTML = `<div class="overlay" id="ovl"><div class="sheet" role="dialog" aria-labelledby="mvt">
    <h4 id="mvt">Move your match to ${hhmm(s.time)}?</h4>
    <span class="hint">All ${mv.size} of you move from ${hhmm(mv.from)} to ${hhmm(s.time)}. ${hhmm(mv.from)} is freed up for others.</span>
    <div class="gm-btns"><button type="button" class="ghost" id="mv-keep">Keep ${hhmm(mv.from)}</button><button class="primary" id="mv-go">Move match to ${hhmm(s.time)}</button></div>
  </div></div>`
  const close = () => { $('modal').innerHTML = '' }
  $('mv-keep').onclick = close
  $('ovl').onclick = e => { if (e.target.id === 'ovl') close() }
  $('mv-go').onclick = async () => {
    $('mv-go').disabled = true
    try { await api.moveMatchBooking(mv.bookingId, s.id) } catch (err) { toast(err.message); close(); await render(); return } // nothing changed
    Object.assign(S, { matchMove: null, aview: 'match', navReset: true })
    close(); await render(); top0()
    toast(`Match moved to ${hhmm(s.time)}`)
  }
}
