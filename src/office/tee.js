// Club office → Tee sheet: a day's tee times as one grid (who's in each), the next 7 days. Tap a time to see the
// booking. Underneath: requests for days not open yet, and the booking rules.
import * as api from '../api.js'
import { S } from '../state.js'
import { $, esc, ini, header, keepScroll, render, toast, top0 } from '../ui.js'
import { DN, fromIso, hhmm, isoDate, longDay, nextDays } from '../dates.js'
import { timeLabel } from '../release.js'
import { summary, forgetSummary, panel } from './shell.js'
import { declineSheet } from './today.js'

export async function load() {
  const days = nextDays(7).map(isoDate), date = days[Math.min(S.oDay ?? 0, 6)]
  const [s, sheet, rules, members] = await Promise.all([summary(), api.getTeeSheet(date), api.getBookingRules(), api.getMembers()])
  return { treqs: s.treqs, days, date, sheet: sheet ?? [], rules, members }
}

export function draw({ treqs, days, date, sheet, rules, members }) {
  const booked = sheet.filter(s => s.players.length).length, cap = Math.max(4, ...sheet.map(s => s.capacity))
  header('Tee sheet', `${longDay(fromIso(date))} · <b>${booked}</b> of ${sheet.length} times booked`)
  const name = id => members.find(m => m.id === id)?.name ?? 'A member'
  const who = r => [r.member?.name ?? name(r.memberId), ...r.memberIds.map(name), ...r.guests.map(g => `${g.name} (guest)`)]
  $('main').innerHTML = `<div class="screen office">
    <div class="odays">${days.map((d, i) => { const x = fromIso(d); return `<button class="day" data-o-day="${i}" aria-pressed="${d === date}"><small>${DN[x.getDay()]}</small><b>${x.getDate()}</b></button>` }).join('')}</div>
    ${sheet.length ? `<div class="card osheetwrap"><div class="osheet" style="--cap:${cap}">${sheet.map(s => `<button class="otime" data-o-slot="${s.id}" aria-label="${hhmm(s.time)}: ${s.players.length ? `${s.players.length} booked` : 'free'}"><span class="otm">${hhmm(s.time)}</span>${
      [...Array(cap)].map((_, i) => { const p = s.players[i]; return i >= s.capacity ? '<span class="ocell off"></span>' : p ? `<span class="ocell b${p.guest ? ' g' : ''}">${esc(p.name)}${p.guest ? ' (guest)' : ''}</span>` : '<span class="ocell">Free</span>' }).join('')}</button>`).join('')}</div></div>
    <div class="olegend"><span><i class="b"></i>Member</span><span><i class="b g"></i>Guest</span><span><i></i>Free</span></div>`
      : '<div class="card empty-state">No tee times on this day.</div>'}
    ${treqs.length ? `<h3>Requests for days not open yet</h3><div class="card olist">${treqs.map(r => `<div class="orow"><span class="oic">📨</span><span class="ot"><b>${esc(r.member?.name ?? name(r.memberId))}: ${longDay(fromIso(r.date))} at ${hhmm(r.time)}</b><span>${esc(who(r).join(', '))} · “${esc(r.reason)}”</span></span>
      <span class="oacts"><button class="ghost sm" data-o-decline="${r.id}">Decline</button><button class="primary sm" data-o-book="${r.id}">Book it</button></span></div>`).join('')}</div>` : ''}
    <h3>Booking rules</h3>
    <div class="card olist"><div class="orow"><span class="ot"><b>Tee times open ${timeLabel(rules.time)}, ${rules.days} day${rules.days === 1 ? '' : 's'} before</b><span>${rules.weekendsOnly ? 'Weekends only' : 'Every day'}</span></span><span class="oacts"><button class="ghost sm" id="o-rules">Change</button></span></div>
      <div class="orow"><span class="ot"><b>Earlier requests</b><span>Requests already answered</span></span><span class="oacts"><button class="ghost sm" id="o-treq">Open</button></span></div></div>
  </div>`

  const done = async msg => { forgetSummary(); await keepScroll(render); toast(msg) }
  document.querySelectorAll('[data-o-day]').forEach(b => (b.onclick = () => { S.oDay = +b.dataset.oDay; keepScroll(render) }))
  document.querySelectorAll('[data-o-slot]').forEach(b => (b.onclick = () => {
    const s = sheet.find(x => x.id === +b.dataset.oSlot)
    panel(`<h4>${hhmm(s.time)}</h4><p class="hint">${longDay(fromIso(date))} · ${s.players.length ? `${s.players.length} of ${s.capacity} booked` : `Free · ${s.capacity} spaces`}${s.twilight ? ' · twilight' : ''}</p>
      ${s.players.length ? `<div class="card olist">${s.players.map(p => `<div class="orow"><span class="av">${esc(ini(p.name))}</span><span class="ot"><b>${esc(p.name)}</b><span>${p.guest ? 'Guest' : 'Member'}</span></span></div>`).join('')}</div>` : '<p class="hint">Nobody has booked this time yet.</p>'}`)
  }))
  document.querySelectorAll('[data-o-book]').forEach(b => (b.onclick = async () => {
    b.disabled = true
    try { await api.decideTeeTimeRequest(+b.dataset.oBook, true) } catch (err) { toast(err.message); b.disabled = false; return }
    done('Booked: they’ll see it in their bookings')
  }))
  document.querySelectorAll('[data-o-decline]').forEach(b => (b.onclick = () => declineSheet(treqs.find(r => r.id === +b.dataset.oDecline), name, done)))
  $('o-rules').onclick = async () => { S.aview = 'rules'; await render(); top0() }
  $('o-treq').onclick = async () => { S.aview = 'treq'; await render(); top0() }
}
