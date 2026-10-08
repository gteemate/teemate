// Admin → Tee times: pick a day and a time with space.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, header, top0, render, toast } from '../ui.js'
import { DN, isoDate, nextDays, longDay, hhmm } from '../dates.js'
import { toAdmin } from './nav.js'

export async function load() {
  const days = nextDays(7)
  const [sheet, points, me] = await Promise.all([api.getTeeSheet(isoDate(days[S.day])), api.getGuestPoints(), api.getMe()])
  return { days, sheet, points, me }
}

// Tee times have to be at least 2 hours apart (the database checks this too, for everyone booked).
const GAP = 120

export function draw({ days, sheet, points, me }) {
  const mine = sheet.filter(s => s.players.some(p => p.memberId === me.id))
  const isMine = s => mine.includes(s)
  const tooClose = s => !isMine(s) && mine.find(m => Math.abs(m.time - s.time) < GAP)
  const free = s => s.capacity - s.players.length
  header('Book tee times', `${longDay(days[S.day])} · <b>${sheet.filter(s => free(s) > 0).length}</b> of ${sheet.length} available`, toAdmin)
  $('dateWrap').innerHTML = `<div class="dates" role="group" aria-label="Choose day">${days.map((d, i) => `<button class="day" data-d="${i}" aria-pressed="${i === S.day}"><small>${i === 0 ? 'Today' : DN[d.getDay()]}</small><b>${d.getDate()}</b></button>`).join('')}</div>`
  const list = sheet.filter(s => S.filter === 'all' || (S.filter === 'open' && free(s) > 0) || (S.filter === '2' && free(s) >= 2))
  const left = points.allowance - points.mine.reduce((t, x) => t + x.points, 0)
  let h = `<div class="screen"><div class="ptsmini${left < points.cost ? ' low' : ''}">🎟️ <b>${left}</b> of ${points.allowance} guest points left · ${points.cost} per guest${left < points.cost ? ' · not enough for a guest' : ''}</div><div class="filters" role="group" aria-label="Filter">${[['all', 'All'], ['open', 'Has space'], ['2', '2+ spaces']].map(([k, l]) => `<button class="chip" data-f="${k}" aria-pressed="${S.filter === k}">${l}</button>`).join('')}</div>`
  for (const [g, a, b] of [['Morning', 0, 720], ['Afternoon', 720, 900], ['Twilight', 900, 1440]]) {
    const gs = list.filter(s => s.time >= a && s.time < b)
    if (!gs.length) continue
    h += `<div class="period">${g}${g === 'Afternoon' ? " · 12:20–13:00 held for Ladies' Comp" : ''}</div>`
    gs.forEach(s => {
      const f = free(s), near = tooClose(s), off = !f || near || isMine(s), taken = s.players.length
      const what = isMine(s) ? 'You’re booked on this' : near ? `Within 2 hours of your ${hhmm(near.time)}` : !f ? 'Fully booked' : f === 4 ? 'Open tee' : `${f} space${f > 1 ? 's' : ''} left`
      h += `<button class="slot${off ? ' full' : ''}${isMine(s) ? ' minebk' : ''}" data-id="${s.id}" ${off ? 'aria-disabled="true"' : ''}><span class="time">${hhmm(s.time)}</span>
        <span class="meta"><strong>${what}${s.twilight ? '<span class="pill tag">Twilight</span>' : ''}</strong>1st tee · 18 holes</span>
        <span class="balls" aria-label="${taken} of ${s.capacity} booked">${[0, 1, 2, 3].map(k => `<span class="ball${k < taken ? ' taken' : ''}"></span>`).join('')}</span></button>`
    })
  }
  $('main').innerHTML = h + '</div>'
  document.querySelectorAll('.day').forEach(b => (b.onclick = async () => { S.day = +b.dataset.d; await render(); top0() }))
  document.querySelectorAll('.chip').forEach(b => (b.onclick = () => { S.filter = b.dataset.f; render() }))
  document.querySelectorAll('.slot').forEach(b => (b.onclick = async () => {
    const s = sheet.find(x => x.id === +b.dataset.id)
    if (isMine(s)) { Object.assign(S, { aview: 'mine' }); await render(); top0(); return } // see it in Bookings
    const near = tooClose(s)
    if (near) { toast(`You’re booked at ${hhmm(near.time)}. Tee times have to be at least 2 hours apart`); return }
    if (!free(s)) { toast('That time is full'); return }
    Object.assign(S, { slotId: s.id, picked: [], guests: [], aview: 'book' })
    await render()
    top0()
  }))
}
